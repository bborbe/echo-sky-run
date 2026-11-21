import { describe, expect, it } from 'vitest'
import { createEchoField, ECHO_LIFE_F, tickEchoes } from '../echo/echo.ts'
import { PLAYER_H, PLAYER_W } from '../physics/constants.ts'
import { createDoor, createSwitch, createSwitchField, stepSwitches } from './switches.ts'

const FLOOR_Y = 32

function playerAt(x: number) {
  return { x, y: FLOOR_Y - PLAYER_H, w: PLAYER_W, h: PLAYER_H }
}

/** An Echo box resting on the switch at (24, 32). */
function echoOnSwitch() {
  return { x: 22, y: 32, w: 32, h: 4, life: ECHO_LIFE_F }
}

describe('Echo switch and door', () => {
  it('opens the door while Pip presses the switch', () => {
    const field = createSwitchField()
    field.switches.push(createSwitch(32, FLOOR_Y - 16))
    field.doors.push(createDoor(200, 0))

    stepSwitches(field, playerAt(32), [])

    expect(field.doors[0].open).toBe(true)
  })

  it('opens the door while an Echo rests on the switch', () => {
    const echoes = createEchoField()
    echoes.echoes.push(echoOnSwitch())
    const field = createSwitchField()
    field.switches.push(createSwitch(24, 32))
    field.doors.push(createDoor(200, 0))

    stepSwitches(field, playerAt(400), echoes.echoes)

    expect(field.doors[0].open).toBe(true)
  })

  it('keeps the door closed with nothing pressing', () => {
    const field = createSwitchField()
    field.switches.push(createSwitch(32, FLOOR_Y - 16))
    field.doors.push(createDoor(200, 0))

    stepSwitches(field, playerAt(400), [])

    expect(field.doors[0].open).toBe(false)
  })

  it('closes the door on the frame the Echo expires', () => {
    const echoes = createEchoField()
    const echo = echoOnSwitch()
    echo.life = 1 // one frame of life left
    echoes.echoes.push(echo)
    const field = createSwitchField()
    field.switches.push(createSwitch(24, 32))
    field.doors.push(createDoor(200, 0))

    stepSwitches(field, playerAt(400), echoes.echoes)
    expect(field.doors[0].open).toBe(true)

    tickEchoes(echoes)
    expect(echoes.echoes).toHaveLength(0)

    stepSwitches(field, playerAt(400), echoes.echoes)
    expect(field.doors[0].open).toBe(false)
  })
})
