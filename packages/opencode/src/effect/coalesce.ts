import { Effect, Fiber, Queue } from "effect"
import type { Duration } from "effect"

/**
 * Publishes the latest state at most once per `interval`, however often `notify` is called:
 * immediately on the first notification, then once more after the interval if others arrived
 * meanwhile, so the final state of a burst is never left unpublished. One fiber does all the
 * publishing, so `publish` never overlaps itself. `stop` waits for an in-flight publish.
 */
export const make = <E, R>(publish: Effect.Effect<unknown, E, R>, interval: Duration.Input) =>
  Effect.gen(function* () {
    const pending = yield* Queue.sliding<void>(1)
    const fiber = yield* Effect.forkScoped(
      Effect.forever(Queue.take(pending).pipe(Effect.andThen(publish), Effect.andThen(Effect.sleep(interval)))),
    )
    return {
      notify: () => {
        Queue.offerUnsafe(pending, undefined)
      },
      stop: Fiber.interrupt(fiber),
    }
  })

export * as Coalesce from "./coalesce"
