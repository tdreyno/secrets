import retry from "async-retry"
import AsyncRetry from "async-retry"
import { shorten } from "../util/shorten"
import { JWTManager } from "./jwtManager"
import { Confidant, Task, TaskState } from "./task"

type JWTContext = any

export abstract class JWT extends Task<JWTContext, string> {
  constructor(
    confidant: Confidant<JWTContext, Record<string, any>>,
    public name: string,
    protected cacheKey: string,
    protected manager: JWTManager,
    protected retry: AsyncRetry.Options = {},
  ) {
    super(confidant)

    this.manager.setLogger(this.confidant.logger)
  }

  initialize(): Promise<string> {
    if (this.state !== TaskState.PENDING) {
      throw new Error(`JWT Task (${this.name}) has already initialized`)
    }

    return this.retryFetchJWT()
  }

  onDestroy(): void {
    this.manager.remove(this.cacheKey)
  }

  protected async retryFetchJWT(): Promise<string> {
    if (this.state === TaskState.DESTROYED) {
      throw new Error(`JWT Task (${this.name}) has been destroyed`)
    }

    const hit = this.manager.get(this.cacheKey)

    if (hit) {
      // this.logger.debug(`JWT cache hit: ${this.name} - ${this.cacheKey}`)
      return hit
    }

    try {
      this.logger.debug(`JWT Fetching (${this.name})`)
      const jwt = await retry(() => this.fetchJWT(), this.retry)
      this.logger.debug(`JWT Received (${this.name}): ${shorten(jwt)}`)

      this.manager.set(this.cacheKey, jwt, () => {
        if (this.state === TaskState.DESTROYED) {
          return true // unsubscribe
        }

        this.logger.debug(`JWT expired (${this.name})`)
        void this.invalidate()
      })

      return jwt
    } catch (e) {
      this.manager.remove(this.cacheKey)

      throw e
    }
  }

  abstract fetchJWT(): Promise<string>

  async invalidate(): Promise<string> {
    if (this.state === TaskState.DESTROYED) {
      throw new Error("Task has been destroyed")
    }

    if (this.state === TaskState.UPDATING) {
      return this.get()
    }

    this.manager.remove(this.cacheKey)

    this.state = TaskState.UPDATING
    const newValue = await this.retryFetchJWT()

    this.set(newValue)

    return newValue
  }
}
