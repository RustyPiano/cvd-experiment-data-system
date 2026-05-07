import { Collapse, Tag } from "antd";

import type { VocabularySelectOption } from "../experiments/editor-types";
import {
  type RecipeModuleKey,
  RecipeSectionEditor,
} from "./recipe-section-editor";

export type RecipePayloadEditorProps = {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  vocabularyOptions: Record<string, VocabularySelectOption[]>;
};

const MODULE_LABELS: Record<RecipeModuleKey, string> = {
  precursors: "前驱体",
  substrates: "基底",
  furnace_program: "温区程序",
  gas_program: "气体程序",
  characterization: "表征计划",
};

const MODULE_KEYS: RecipeModuleKey[] = [
  "precursors",
  "substrates",
  "furnace_program",
  "gas_program",
  "characterization",
];

function moduleHasContent(
  moduleKey: RecipeModuleKey,
  value: Record<string, unknown>,
): boolean {
  switch (moduleKey) {
    case "precursors":
    case "substrates": {
      const items = value.items;
      return Array.isArray(items) && items.length > 0;
    }
    case "furnace_program": {
      const zones = value.zones;
      return Array.isArray(zones) && zones.length > 0;
    }
    case "gas_program": {
      const segments = value.segments;
      const preWashingGas = value.pre_washing_gas;
      return (
        (Array.isArray(segments) && segments.length > 0) ||
        (typeof preWashingGas === "string" && preWashingGas.trim() !== "")
      );
    }
    case "characterization": {
      const methods = value.methods;
      return Array.isArray(methods) && methods.length > 0;
    }
  }
}

export function RecipePayloadEditor({
  value,
  onChange,
  vocabularyOptions,
}: RecipePayloadEditorProps) {
  const handleModuleChange = (moduleKey: RecipeModuleKey, nextModule: Record<string, unknown>) => {
    onChange({ ...value, [moduleKey]: nextModule });
  };

  const collapseItems = MODULE_KEYS.map((moduleKey) => {
    const moduleValue =
      (value[moduleKey] as Record<string, unknown> | undefined) ?? {};
    const hasContent = moduleHasContent(moduleKey, moduleValue);

    return {
      key: moduleKey,
      label: (
        <span>
          {MODULE_LABELS[moduleKey]}{" "}
          {hasContent ? (
            <Tag color="green">已配置</Tag>
          ) : (
            <Tag>空</Tag>
          )}
        </span>
      ),
      children: (
        <RecipeSectionEditor
          moduleKey={moduleKey}
          value={moduleValue}
          onChange={(next) => handleModuleChange(moduleKey, next)}
          vocabularyOptions={vocabularyOptions}
        />
      ),
    };
  });

  return <Collapse items={collapseItems} />;
}
