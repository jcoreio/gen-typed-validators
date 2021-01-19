import * as t from '@babel/types'
import { NodePath } from '@babel/traverse'

function isTypeValidatorAnnotation(
  path:
    | NodePath<t.Identifier | t.QualifiedTypeIdentifier>
    | NodePath<t.Identifier | t.TSQualifiedName>
): boolean {
  const { node } = path
  switch (node.type) {
    case 'Identifier':
      return node.name === 'Type' || node.name === 'TypeAlias'
    case 'QualifiedTypeIdentifier':
      return (
        node.id.type === 'Identifier' &&
        (node.id.name === 'Type' || node.id.name === 'TypeAlias') &&
        node.qualification.type === 'Identifier' &&
        node.qualification.name === 't'
      )
    case 'TSQualifiedName':
      return (
        node.right.type === 'Identifier' &&
        (node.right.name === 'Type' || node.right.name === 'TypeAlias') &&
        node.left.type === 'Identifier' &&
        node.left.name === 't'
      )
  }
}

function getReifiedTypeFromAnnotation(
  annotation: NodePath<any>
): NodePath<t.FlowType> | NodePath<t.TSType> | null {
  switch (annotation.node?.type) {
    case 'TypeAnnotation':
      return getReifiedTypeFromAnnotation(
        (annotation as NodePath<t.TypeAnnotation>).get('typeAnnotation')
      )
    case 'TSTypeAnnotation':
      return getReifiedTypeFromAnnotation(
        (annotation as NodePath<t.TSTypeAnnotation>).get('typeAnnotation')
      )
    case 'GenericTypeAnnotation': {
      const annotationId = (annotation as NodePath<
        t.GenericTypeAnnotation
      >).get('id')
      if (!isTypeValidatorAnnotation(annotationId)) return null

      const typeParameters = (annotation as NodePath<
        t.GenericTypeAnnotation
      >).get('typeParameters')
      if (!typeParameters) return null
      const params = (typeParameters as NodePath<
        t.TypeParameterInstantiation
      >).get('params')
      if (Array.isArray(params) && params[0].isFlowType())
        return params[0] as NodePath<t.FlowType>
      break
    }
    case 'TSTypeReference': {
      const annotationId = (annotation as NodePath<t.TSTypeReference>).get(
        'typeName'
      )
      if (!isTypeValidatorAnnotation(annotationId)) return null

      const typeParameters = (annotation as NodePath<t.TSTypeReference>).get(
        'typeParameters'
      )
      if (!typeParameters) return null
      const params = (typeParameters as NodePath<
        t.TSTypeParameterInstantiation
      >).get('params')
      if (Array.isArray(params) && params[0]) return params[0]
      break
    }
  }
  return null
}

export default function getReifiedType(
  path: NodePath<any>
): NodePath<t.FlowType> | NodePath<t.TSType> | null {
  if (path.isVariableDeclarator()) {
    const id = (path as NodePath<t.VariableDeclarator>).get('id')
    if (!id.isIdentifier()) return null
    return getReifiedTypeFromAnnotation(
      (id as NodePath<t.Identifier>).get('typeAnnotation')
    )
  }
  if (path.isTypeCastExpression()) {
    const expression = (path as NodePath<t.TypeCastExpression>).get(
      'expression'
    )

    if (!expression.isIdentifier() || expression.node.name !== 'reify')
      return null

    return getReifiedTypeFromAnnotation(
      (path as NodePath<t.TypeCastExpression>)
        .get('typeAnnotation')
        .get('typeAnnotation')
    )
  } else if (path.isTSAsExpression()) {
    const expression = (path as NodePath<t.TSAsExpression>).get('expression')

    if (!expression.isIdentifier() || expression.node.name !== 'reify')
      return null
    return getReifiedTypeFromAnnotation(
      (path as NodePath<t.TSAsExpression>).get('typeAnnotation')
    )
  }
  return null
}
