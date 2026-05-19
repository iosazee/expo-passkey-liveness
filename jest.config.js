const sharedModuleNameMapper = {
  "^~/(.*)$": "<rootDir>/src/$1",
  // better-auth/api is ESM-only; map to a passthrough mock for tests.
  "^better-auth/api$":
    "<rootDir>/src/server/__tests__/__mocks__/better-auth-api.ts",
  "^better-call$": "<rootDir>/src/server/__tests__/__mocks__/better-call.ts",
};

const sharedTransform = {
  "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
};

const sharedIgnore = [
  "/node_modules/",
  "/__tests__/",
  "/types\\.ts$",
];

export default {
  testEnvironment: "node",
  moduleDirectories: ["node_modules", "<rootDir>/src"],
  moduleNameMapper: sharedModuleNameMapper,
  projects: [
    {
      displayName: "root",
      testMatch: ["<rootDir>/src/__tests__/**/*.test.ts"],
      preset: "ts-jest",
      testEnvironment: "node",
      moduleNameMapper: sharedModuleNameMapper,
      transform: sharedTransform,
      coveragePathIgnorePatterns: sharedIgnore,
    },
    {
      displayName: "client",
      testMatch: [
        "<rootDir>/src/client/**/__tests__/**/*.test.ts",
        "<rootDir>/src/client/**/__tests__/**/*.test.tsx",
      ],
      preset: "ts-jest",
      testEnvironment: "node",
      moduleNameMapper: sharedModuleNameMapper,
      setupFilesAfterEnv: [
        "<rootDir>/src/client/__tests__/jest.client.setup.js",
      ],
      transform: sharedTransform,
      coveragePathIgnorePatterns: sharedIgnore,
    },
    {
      displayName: "server",
      testMatch: ["<rootDir>/src/server/**/__tests__/**/*.test.ts"],
      preset: "ts-jest",
      testEnvironment: "node",
      moduleNameMapper: sharedModuleNameMapper,
      setupFilesAfterEnv: [
        "<rootDir>/src/server/__tests__/jest.server.setup.js",
      ],
      transform: sharedTransform,
      coveragePathIgnorePatterns: sharedIgnore,
    },
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**/*",
    "!**/node_modules/**",
  ],
  coverageProvider: "v8",
  cache: false,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};
