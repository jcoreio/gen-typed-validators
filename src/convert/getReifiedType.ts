import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'

export default function getReifiedType(
  path: NodePath<any>
): NodePath<t.FlowType> | NodePath<t.TSType> | null {
  if (path.isTypeCastExpression()) {
    const expression = (path as NodePath<t.TypeCastExpression>).get(
      'expression'
    )

    if (!expression.isIdentifier() || expression.node.name !== 'reify')
      return null
    const annotation = (path as NodePath<t.TypeCastExpression>)
      .get('typeAnnotation')
      .get('typeAnnotation')
    if (!annotation.isGenericTypeAnnotation()) return null
    const annotationId = (annotation as NodePath<t.GenericTypeAnnotation>).get(
      'id'
    )
    if (!annotationId.isIdentifier() || annotationId.node.name !== 'Type')
      return null
    const typeParameters = (annotation as NodePath<
      t.GenericTypeAnnotation
    >).get('typeParameters')
    if (!typeParameters) return null
    const params = (typeParameters as NodePath<
      t.TypeParameterInstantiation
    >).get('params')
    if (Array.isArray(params) && params[0].isFlowType())
      return params[0] as NodePath<t.FlowType>
  } else if (path.isTSAsExpression()) {
    const expression = (path as NodePath<t.TSAsExpression>).get('expression')

    if (!expression.isIdentifier() || expression.node.name !== 'reify')
      return null
    const annotation = (path as NodePath<t.TSAsExpression>).get(
      'typeAnnotation'
    )
    if (!annotation.isTSTypeReference()) return null
    const annotationId = (annotation as NodePath<t.TSTypeReference>).get(
      'typeName'
    )
    if (!annotationId.isIdentifier() || annotationId.node.name !== 'Type')
      return null
    const typeParameters = (annotation as NodePath<t.TSTypeReference>).get(
      'typeParameters'
    )
    if (!typeParameters) return null
    const params = (typeParameters as NodePath<
      t.TSTypeParameterInstantiation
    >).get('params')
    if (Array.isArray(params) && params[0]) return params[0]
  }
  return null
}
