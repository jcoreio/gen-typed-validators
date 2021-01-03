import * as t from '@babel/types'
import template from '@babel/template'
import { FileConversionContext } from './index'
import { NodePath } from '@babel/traverse'

const templates = {
  instanceOf: template.expression`T.instanceOf(() => CLASS)`,
  ref: template.expression`T.ref(() => TYPE)`,
}

function convertClassReference(
  id: t.Identifier | t.QualifiedTypeIdentifier
): t.Identifier | t.MemberExpression {
  if (id.type === 'Identifier') return t.identifier(id.name)
  return t.memberExpression(
    convertClassReference(id.qualification),
    convertClassReference(id.id)
  )
}

function convertTypeAliasQualification(
  context: FileConversionContext,
  id: t.Identifier | t.QualifiedTypeIdentifier
): t.Identifier | t.MemberExpression {
  if (id.type === 'Identifier') return t.identifier(id.name)
  return t.memberExpression(
    convertTypeAliasQualification(context, id.qualification),
    convertTypeAliasQualification(context, id.id)
  )
}

function convertTypeAliasReference(
  context: FileConversionContext,
  id: t.Identifier | t.QualifiedTypeIdentifier
): t.Identifier | t.MemberExpression {
  if (id.type === 'Identifier') return context.getValidatorIdentifier(id)
  return t.memberExpression(
    convertTypeAliasQualification(context, id.qualification),
    convertTypeAliasReference(context, id.id)
  )
}

export default async function convertGenericTypeAnnotation(
  context: FileConversionContext,
  path: NodePath<t.GenericTypeAnnotation>
): Promise<t.Expression> {
  const type = path.node
  const { id } = type

  if (await context.isClass(path)) {
    return templates.instanceOf({
      T: context.t,
      CLASS: convertClassReference(id),
    })
  } else {
    return templates.ref({
      T: context.t,
      TYPE: convertTypeAliasReference(context, id),
    })
  }
}
