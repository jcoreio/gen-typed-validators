import * as t from '@babel/types'

/* eslint-disable @typescript-eslint/no-use-before-define */

export default function areASTsEqual(a: t.Node, b: t.Node): boolean {
  if (t.isFile(a))
    return t.isFile(b) && areFieldValuesEqual(a.program, b.program)
  if (a.type !== b.type) return false
  const nodeFields = t.NODE_FIELDS[a.type]
  for (const name in nodeFields) {
    const field = (nodeFields as any)[name]
    if (
      !areFieldValuesEqual(
        (a as any)[name] ?? field.default,
        (b as any)[name] ?? field.default
      )
    )
      return false
  }
  return true
}

function areFieldValuesEqual(a: any, b: any): boolean {
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || b.length !== a.length) return false
    return a.every((value, index) => areFieldValuesEqual(value, b[index]))
  } else if (t.isNode(a)) {
    return t.isNode(b) && areASTsEqual(a, b)
  } else {
    return Object.is(a, b)
  }
}

type Mismatch = { path: (string | number)[]; a: any; b: any }

export function areASTsEqual_getMismatch(
  a: t.Node,
  b: t.Node
): Mismatch | null {
  if (t.isFile(a)) {
    if (!t.isFile(b)) return { path: [], a, b }
    const mismatch = areFieldValuesEqual_getMismatch(a.program, b.program)
    if (mismatch) {
      mismatch.path.unshift('program')
      return mismatch
    }
    return null
  }
  if (a.type !== b.type) return { path: [], a, b }
  const nodeFields = t.NODE_FIELDS[a.type]
  for (const name in nodeFields) {
    const field = (nodeFields as any)[name]
    const mismatch = areFieldValuesEqual_getMismatch(
      (a as any)[name] ?? field.default,
      (b as any)[name] ?? field.default
    )
    if (mismatch) {
      mismatch.path.unshift(name)
      return mismatch
    }
  }
  return null
}

function areFieldValuesEqual_getMismatch(a: any, b: any): Mismatch | null {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return { path: [], a, b }
    if (b.length !== a.length)
      return { path: [Math.min(a.length, b.length)], a, b }
    for (let i = 0; i < a.length; i++) {
      const mismatch = areFieldValuesEqual_getMismatch(a[i], b[i])
      if (mismatch) {
        mismatch.path.unshift(i)
        return mismatch
      }
    }
    return null
  } else if (t.isNode(a)) {
    return t.isNode(b) ? areASTsEqual_getMismatch(a, b) : { path: [], a, b }
  } else {
    return Object.is(a, b) ? null : { path: [], a, b }
  }
}
