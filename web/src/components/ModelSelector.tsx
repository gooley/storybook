import { useState } from "react";
import type { ModelOption } from "../api/client";

interface ModelSelectorProps {
  label: string;
  options: ModelOption[];
  value: string;
  onChange: (modelId: string) => void;
}

const CUSTOM_VALUE = "__custom__";

export function ModelSelector({ label, options, value, onChange }: ModelSelectorProps) {
  const isKnownModel = options.some((m) => m.id === value);
  const [isCustom, setIsCustom] = useState(!isKnownModel && value !== "");
  const [customValue, setCustomValue] = useState(isCustom ? value : "");

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === CUSTOM_VALUE) {
      setIsCustom(true);
      if (customValue) onChange(customValue);
    } else {
      setIsCustom(false);
      onChange(val);
    }
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomValue(val);
    if (val.trim()) onChange(val.trim());
  };

  const selectValue = isCustom ? CUSTOM_VALUE : value;

  return (
    <div className="model-selector">
      <label className="model-selector-label">{label}</label>
      <div className="model-selector-controls">
        <select
          className="model-selector-dropdown"
          value={selectValue}
          onChange={handleSelectChange}
        >
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.isDefault ? " (default)" : ""}
              {m.compatibility === "experimental" ? " ⚗️" : ""}
            </option>
          ))}
          <option value={CUSTOM_VALUE}>Custom model ID…</option>
        </select>
        {isCustom && (
          <input
            className="model-selector-custom-input"
            type="text"
            placeholder="e.g. openai/gpt-5-image"
            value={customValue}
            onChange={handleCustomChange}
            autoFocus
          />
        )}
      </div>
    </div>
  );
}
