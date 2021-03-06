import { NodePath } from '@babel/traverse'

function formatPosition(path: NodePath<any>): string {
  const { loc } = path.node
  const line = loc?.start?.line || '?'
  const column = loc?.start?.column
  const col = column != null ? column + 1 : '?'
  return `${line}:${col}`
}

export default class NodeConversionError extends Error {
  public readonly path: NodePath<any>
  public readonly file: string

  constructor(message: string, file: string, path: NodePath<any>) {
    super(`${message} (${file}:${formatPosition(path)})`)
    this.file = file
    this.path = path
    this.name = 'NodeConversionError'
  }
}
