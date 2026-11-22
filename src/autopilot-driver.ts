/**
 * The `?autopilot=1` driver: it turns the shared scripted decision into the same `SimInput` the
 * keyboard produces, so the frame loop feeds it through `advance()` exactly as it feeds a player.
 *
 * It carries no level. The level arrives as the running sim, which is what lets one driver serve
 * every level the game ships — and what keeps this module free of any per-level import.
 */

import type { SimInput, SimState } from './game/sim.ts'
import { autopilotDecision } from './toolkit/autopilot.ts'

export interface AutopilotDriver {
  /** The input for the next fixed step, decided from the sim as it stands now. */
  input(sim: SimState): SimInput
  /** A new run starts with the Echo unplaced. */
  reset(): void
  /** True once the Echo has been placed, so a recording can be checked against it. */
  readonly echoPlaced: boolean
}

/** The spot the Echo is placed at, or null to never place one. */
export function createAutopilotDriver(echoAtX: number | null): AutopilotDriver {
  let echoUsed = false

  return {
    input(sim: SimState): SimInput {
      const decision = autopilotDecision(sim, echoAtX, echoUsed)
      echoUsed = decision.echoUsed
      return {
        left: false,
        right: true,
        jump: true,
        jumpPressed: decision.jumpPressed,
        sprint: true,
        echoPressed: decision.echoPressed,
      }
    },
    reset(): void {
      echoUsed = false
    },
    get echoPlaced(): boolean {
      return echoUsed
    },
  }
}
