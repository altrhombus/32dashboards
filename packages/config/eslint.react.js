import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import base from "./eslint.base.js";

export default [
  ...base,
  {
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // TypeScript already enforces prop shapes; this rule is redundant noise here.
      "react/prop-types": "off",
      // New JSX transform (React 19 + Vite) doesn't require React in scope.
      "react/react-in-jsx-scope": "off",
    },
    settings: {
      react: { version: "detect" },
    },
  },
];
