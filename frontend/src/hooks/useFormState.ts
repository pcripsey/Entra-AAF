import { useState, useCallback, ChangeEvent } from 'react';

type FieldValues = Record<string, string | boolean | string[]>;
type FieldErrors = Record<string, string>;
type Validator<T extends FieldValues> = (values: T) => Partial<Record<keyof T, string>>;

interface UseFormStateReturn<T extends FieldValues> {
  values: T;
  errors: FieldErrors;
  isDirty: boolean;
  setField: (name: keyof T, value: T[keyof T]) => void;
  handleChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  validate: (validator: Validator<T>) => boolean;
  reset: (initial?: T) => void;
  setValues: (vals: Partial<T>) => void;
}

export function useFormState<T extends FieldValues>(initialValues: T): UseFormStateReturn<T> {
  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isDirty, setIsDirty] = useState(false);

  const setField = useCallback((name: keyof T, value: T[keyof T]) => {
    setValuesState((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name as string]: '' }));
    setIsDirty(true);
  }, []);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setValuesState((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
    setIsDirty(true);
  }, []);

  const validate = useCallback((validator: Validator<T>): boolean => {
    const result = validator(values);
    const newErrors: FieldErrors = {};
    let valid = true;
    for (const key in result) {
      const msg = result[key];
      if (msg) {
        newErrors[key] = msg;
        valid = false;
      }
    }
    setErrors(newErrors);
    return valid;
  }, [values]);

  const reset = useCallback((initial?: T) => {
    setValuesState(initial ?? initialValues);
    setErrors({});
    setIsDirty(false);
  }, [initialValues]);

  const setValues = useCallback((vals: Partial<T>) => {
    setValuesState((prev) => ({ ...prev, ...vals }));
  }, []);

  return { values, errors, isDirty, setField, handleChange, validate, reset, setValues };
}
