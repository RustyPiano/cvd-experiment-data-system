"""Published scientific schema, including its declared cross-field range rule."""

from jsonschema import Draft202012Validator, ValidationError, validators


def _ordered(_validator, keys, instance, _schema):
    if isinstance(instance, dict):
        lower, upper = (instance.get(key) for key in keys)
        if isinstance(lower, (int, float)) and isinstance(upper, (int, float)) and upper <= lower:
            yield ValidationError(f"{keys[1]} must be greater than {keys[0]}")


ScientificJSONValidator = validators.extend(Draft202012Validator, {"x-cvd-ordered": _ordered})
