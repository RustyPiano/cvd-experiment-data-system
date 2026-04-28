import { DownOutlined } from "@ant-design/icons";
import { Button, Dropdown, type MenuProps } from "antd";
import { useMemo } from "react";

import type { RecipeRead } from "../../../shared/types/api";
import type { QuickTemplate } from "../data/builtin-templates";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function materialSystemMatches(recipeMaterialSystem: string | null, currentMaterialSystem?: string) {
  if (!recipeMaterialSystem) {
    return true;
  }

  return recipeMaterialSystem === currentMaterialSystem?.trim();
}

function toRecipeTemplate(
  recipe: RecipeRead,
  moduleKey: QuickTemplate["moduleKey"],
): QuickTemplate | null {
  const payload = asRecord(recipe.default_payload_json[moduleKey]);
  if (!payload) {
    return null;
  }

  return {
    key: `recipe:${recipe.id}:${moduleKey}`,
    label: recipe.name,
    materialSystem: recipe.material_system ?? undefined,
    moduleKey,
    payload,
  };
}

export function QuickTemplateMenu({
  disabled,
  materialSystem,
  moduleKey,
  onSelect,
  recipeTemplates = [],
  templates,
}: {
  disabled?: boolean;
  materialSystem?: string;
  moduleKey: QuickTemplate["moduleKey"];
  onSelect: (template: QuickTemplate) => void;
  recipeTemplates?: RecipeRead[];
  templates: QuickTemplate[];
}) {
  const { items, templateByMenuKey } = useMemo(() => {
    const nextTemplateByMenuKey = new Map<string, QuickTemplate>();
    const builtinItems = templates
      .filter((template) => template.moduleKey === moduleKey)
      .map((template) => {
        const key = `builtin:${template.key}`;
        nextTemplateByMenuKey.set(key, template);
        return {
          key,
          label: template.label,
        };
      });

    const recipeItems = recipeTemplates
      .filter((recipe) => materialSystemMatches(recipe.material_system, materialSystem))
      .map((recipe) => toRecipeTemplate(recipe, moduleKey))
      .filter((template): template is QuickTemplate => Boolean(template))
      .map((template) => {
        nextTemplateByMenuKey.set(template.key, template);
        return {
          key: template.key,
          label: template.label,
        };
      });

    const nextItems: MenuProps["items"] = [
      {
        key: "builtin-templates",
        label: "内置模板",
        type: "group",
        children: builtinItems,
      },
    ];

    if (recipeItems.length > 0) {
      nextItems.push({
        key: "recipe-templates",
        label: "用户 Recipe 模板",
        type: "group",
        children: recipeItems,
      });
    }

    return { items: nextItems, templateByMenuKey: nextTemplateByMenuKey };
  }, [materialSystem, moduleKey, recipeTemplates, templates]);

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    const template = templateByMenuKey.get(key);
    if (template) {
      onSelect(template);
    }
  };

  return (
    <Dropdown
      disabled={disabled}
      menu={{
        items,
        onClick: handleMenuClick,
      }}
      trigger={["click"]}
    >
      <Button disabled={disabled}>
        套用模板
        <DownOutlined aria-hidden="true" />
      </Button>
    </Dropdown>
  );
}
