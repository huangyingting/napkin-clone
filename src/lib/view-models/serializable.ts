type SerializablePrimitive = string | number | boolean | null;

export type SerializableValue =
  | SerializablePrimitive
  | SerializableValue[]
  | { [key: string]: SerializableValue };

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertViewModelSerializable(
  value: unknown,
  path = "$",
): asserts value is SerializableValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertViewModelSerializable(item, `${path}[${index}]`),
    );
    return;
  }

  if (typeof value === "object" && value !== null && isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertViewModelSerializable(item, `${path}.${key}`);
    }
    return;
  }

  const tag = Object.prototype.toString.call(value);
  throw new TypeError(`${path} is not serializable (${tag})`);
}
