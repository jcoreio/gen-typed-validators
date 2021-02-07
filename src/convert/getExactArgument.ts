import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'
import { FileConversionContext } from './ConversionContext'
import getTypeParams from './getTypeParams'

export default function getExactArgument(
  context: FileConversionContext,
  path: NodePath<t.FlowType>
): NodePath<t.FlowType> | void {
  if (!path.isGenericTypeAnnotation()) return
  const id = (path as NodePath<t.GenericTypeAnnotation>).get('id')
  if (!id.isIdentifier() || id.node.name !== '$Exact') return
  const [param] = getTypeParams(context, path, 1)
  return param
}
