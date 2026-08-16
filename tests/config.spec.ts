import { describe, expect, it } from 'vitest'
import { Config } from '../src/index.ts'

describe('dsh-queue-merge config', () => {
  it('defaults to merge mode with a minimum queue of 2', () => {
    const cfg = Config({})
    expect(cfg.defaultMode).toBe('merge')
    expect(cfg.minQueueForMerge).toBe(2)
  })

  it('accepts an explicit individually default', () => {
    const cfg = Config({ defaultMode: 'individually', minQueueForMerge: 3 })
    expect(cfg.defaultMode).toBe('individually')
    expect(cfg.minQueueForMerge).toBe(3)
  })

  it('rejects invalid modes and out-of-range minQueueForMerge', () => {
    expect(() => Config({ defaultMode: 'bogus' })).toThrow()
    expect(() => Config({ minQueueForMerge: 0 })).toThrow()
    expect(() => Config({ minQueueForMerge: 21 })).toThrow()
  })
})
