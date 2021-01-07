export default function once<F extends (...args: any[]) => any>(fn: F): F {
  let result: [any] | undefined
  function onceified(this: any, ...args: any[]): any {
    if (!result) result = [fn.apply(this, args)]
    return result[0]
  }
  return onceified as any
}
