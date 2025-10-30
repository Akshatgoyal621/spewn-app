export type Splits = {
  savings: number
  parents_preserve: number
  extras_buffer: number
  wants: number
  needs: number
}

export const PRESETS = {
  balanced: { savings:30, parents_preserve:10, extras_buffer:10, wants:15, needs:35 },
  conservative: { savings:35, parents_preserve:10, extras_buffer:5, wants:10, needs:40 },
  aggressive: { savings:40, parents_preserve:5, extras_buffer:10, wants:20, needs:25 }
} as const
