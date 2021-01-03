import { NodePath } from '@babel/traverse'

export default class NodeConversionError extends Error {
  public readonly path: NodePath<any>
  public readonly file: string

  constructor(message: string, file: string, path: NodePath<any>) {
    super(message)
    this.file = file
    this.path = path
    this.name = 'NodeConversionError'
  }
}
