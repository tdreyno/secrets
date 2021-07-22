import { SecretsManager } from "aws-sdk"
import ms from "ms"
import { Confidant, Task, TaskMaker } from "../core/task"

type KeyCache = {
  [key: string]: {
    value: string
    timeoutId?: NodeJS.Timeout | number
  }
}

export class AWSManager {
  public cache: KeyCache = {}
  private refetchTimeMs: number

  /**
   * https://github.com/vercel/ms
   **/
  constructor(public secretsManager: SecretsManager, refetchTimeMs = "5m") {
    this.refetchTimeMs = ms(refetchTimeMs)
    this.clear()
  }

  clear(): void {
    this.cache = {}
  }

  get(key: string): string | undefined {
    if (!this.cache[key]) {
      return
    }

    return this.cache[key].value
  }

  set(key: string, value: string, notifyOnExpiry?: () => void): void {
    if (this.cache[key] && this.cache[key].timeoutId) {
      clearTimeout(this.cache[key].timeoutId as any)
      this.cache[key].timeoutId = undefined
    }

    this.cache[key] = { value }

    if (notifyOnExpiry) {
      const timeoutId = setTimeout(() => {
        notifyOnExpiry()
      }, this.refetchTimeMs)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.cache[key]!.timeoutId = timeoutId
    }
  }

  remove(key: string): void {
    if (!this.cache[key]) {
      return
    }

    if (this.cache[key].timeoutId) {
      clearTimeout(this.cache[key].timeoutId as any)
      this.cache[key].timeoutId = undefined
    }

    delete this.cache[key]
  }

  fetch(key: string, notifyOnExpiry?: () => void): Promise<string> {
    return new Promise<string>((resolve, reject) =>
      this.secretsManager.getSecretValue({ SecretId: key }, (err, data) => {
        if (err) {
          this.remove(key)
          return reject(err)
        }

        const { SecretString: value } = data

        if (data === undefined || value === undefined) {
          this.remove(key)
          return reject(`Invalid key: ${key}`)
        }

        this.set(key, value, notifyOnExpiry)

        return resolve(value)
      }),
    )
  }
}

interface AWSSecretContext {
  awsManager: AWSManager
}

class AWSSecret_ extends Task<AWSSecretContext, string> {
  constructor(
    confidant: Confidant<AWSSecretContext, Record<string, any>>,
    private key: string,
  ) {
    super(confidant)
  }

  async initialize(): Promise<string> {
    const { awsManager } = this.confidant.context

    return awsManager.fetch(this.key, () => {
      void this.fetch()
    })
  }

  async fetch(): Promise<string> {
    const { awsManager } = this.confidant.context

    const value = await awsManager.fetch(this.key, () => {
      void this.fetch()
    })

    this.set(value)

    return value
  }
}

export const AWSSecret =
  (key: string): TaskMaker<AWSSecretContext, string> =>
  context =>
    new AWSSecret_(context, key)

export type AWSSecret = AWSSecret_
