import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'
import { FileConversionContext } from './ConversionContext'
import NodeConversionError from '../NodeConversionError'

export default function getTypeParams(
  context: FileConversionContext,
  path: NodePath<t.GenericTypeAnnotation>,
  required: boolean | number = true
): NodePath<t.FlowType>[] {
  const typeParameters = path.get('typeParameters')
  if (!typeParameters.isTypeParameterInstantiation()) {
    if (!required) return []
    throw new NodeConversionError(
      `Missing required type parameter(s)`,
      context.file,
      path
    )
  }
  const params = (typeParameters as NodePath<t.TypeParameterInstantiation>).get(
    'params'
  )
  if (
    typeof required === 'number'
      ? params.length !== required
      : required
      ? params.length
      : false
  ) {
    throw new NodeConversionError(
      `Missing required type parameter(s)`,
      context.file,
      path
    )
  }
  return params
}
