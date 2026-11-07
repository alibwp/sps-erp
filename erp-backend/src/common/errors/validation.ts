import { ValidationError, ValidationPipe } from '@nestjs/common';
import { FieldErrors, ValidationFailed } from './api-exception.js';

// Flattens class-validator errors into { "address.city": ["..."] }.
export function fieldErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldErrors {
  const fields: FieldErrors = {};
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.constraints) {
      fields[path] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      Object.assign(fields, fieldErrors(error.children, path));
    }
  }
  return fields;
}

// The one pipe every request body and query goes through.
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new ValidationFailed(fieldErrors(errors)),
  });
}
