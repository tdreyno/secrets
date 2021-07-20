import { sign } from "jsonwebtoken"
import { timeout } from "../../util/timeout"
import { JWTManager } from "../jwtManager"

const JWT = sign({ foo: "bar" }, "secret")

describe("jwtManager", () => {
  it("should clear", () => {
    const manager = new JWTManager()

    manager.set("URL", "username", "password", JWT)

    const resultA = manager.get("URL", "username", "password")
    expect(resultA).toBe(JWT)

    manager.clear()

    const resultB = manager.get("URL", "username", "password")
    expect(resultB).toBeUndefined()
  })

  it("should get from cache hit", () => {
    const manager = new JWTManager()

    manager.set("URL", "username", "password", JWT)

    const resultA = manager.get("URL", "username", "password")
    expect(resultA).toBe(JWT)
  })

  it("should get undefined from cache miss", () => {
    const manager = new JWTManager()

    const resultB = manager.get("URL2", "username2", "password2")
    expect(resultB).toBeUndefined()
  })

  it("should set JWT", () => {
    const manager = new JWTManager()

    manager.set("URL", "username", "password", JWT)

    const resultA = manager.get("URL", "username", "password")
    expect(resultA).toBe(JWT)
  })

  it("should immediately notifyOnExpiry when setting already expired JWT", async () => {
    jest.useRealTimers()

    const expiredJWT = sign({ foo: "bar" }, "secret", { expiresIn: "200ms" })

    try {
      await timeout(200)
    } catch (e) {}

    const manager = new JWTManager("0s")

    const onExpiry = jest.fn()

    manager.set("URL1", "username1", "password1", expiredJWT, onExpiry)

    expect(onExpiry).toHaveBeenCalled()

    jest.useFakeTimers()
  })

  it("should notifyOnExpiry when JWT expires", () => {
    const expiredJWT = sign({ foo: "bar" }, "secret", { expiresIn: "10s" })

    const manager = new JWTManager("1s")

    const onExpiry = jest.fn()

    manager.set("URL2", "username2", "password2", expiredJWT, onExpiry)

    expect(onExpiry).not.toHaveBeenCalled()

    jest.advanceTimersByTime(10000)

    expect(onExpiry).toHaveBeenCalled()
  })

  it("should know if a JWT is expired", () => {
    const manager = new JWTManager()

    const expiredJWT1 = sign({ foo: "bar1" }, "secret", { expiresIn: "-10m" })
    expect(manager.isExpired(expiredJWT1)).toBeTruthy()

    const expiredJWT2 = sign({ foo: "bar2" }, "secret", { expiresIn: "10m" })
    expect(manager.isExpired(expiredJWT2)).toBeFalsy()
  })

  it("should notifyOnExpiry when JWT expires even if it is set twice", () => {
    const expiredJWT1 = sign({ foo: "bar1" }, "secret", { expiresIn: "2s" })
    const expiredJWT2 = sign({ foo: "bar2" }, "secret", { expiresIn: "5s" })

    const manager = new JWTManager("0s")

    const onExpiry = jest.fn()

    manager.set("URL", "username", "password", expiredJWT1, onExpiry)
    manager.set("URL", "username", "password", expiredJWT2, onExpiry)

    expect(onExpiry).not.toHaveBeenCalled()

    jest.advanceTimersByTime(2000)

    expect(onExpiry).not.toHaveBeenCalled()

    jest.advanceTimersByTime(3000)

    expect(onExpiry).toHaveBeenCalledTimes(1)
  })

  it("should remove JWT", () => {
    const manager = new JWTManager()

    manager.set("URL", "username", "password", JWT)

    const resultA = manager.get("URL", "username", "password")
    expect(resultA).toBe(JWT)

    manager.remove("URL", "username", "password")

    const resultB = manager.get("URL", "username", "password")
    expect(resultB).toBeUndefined()
  })
})
