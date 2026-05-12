import { AutoComplete, Input } from "antd";

import {
  withLegacyVocabularyOption,
  type VocabularySelectOption,
} from "../editor-types";

export function VocabularyCombobox({
  ariaLabel,
  disabled,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  disabled: boolean;
  onChange: (value: string) => void;
  options: VocabularySelectOption[];
  placeholder: string;
  value: string;
}) {
  const resolvedOptions = withLegacyVocabularyOption(options, value);
  const displayValue = resolvedOptions.find((option) => option.value === value)?.label ?? value;

  return (
    <AutoComplete
      disabled={disabled}
      filterOption={(inputValue, option) => {
        const normalizedInput = inputValue.toLowerCase();
        return (
          String(option?.label ?? "").toLowerCase().includes(normalizedInput) ||
          String(option?.value ?? "").toLowerCase().includes(normalizedInput)
        );
      }}
      onChange={(nextValue) => {
        const matchingOption = resolvedOptions.find((option) => option.label === nextValue);
        onChange(matchingOption?.value ?? nextValue);
      }}
      onSelect={(nextValue) => {
        onChange(String(nextValue));
      }}
      options={resolvedOptions}
      placeholder={placeholder}
      value={displayValue}
    >
      <Input aria-label={ariaLabel} placeholder={placeholder} />
    </AutoComplete>
  );
}
