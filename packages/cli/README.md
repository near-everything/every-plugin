# every-plugin CLI

A command-line tool for managing every-plugin development lifecycle.

## Commands

### `create <plugin-name>`
Initialize a new plugin with the correct structure and dependencies.

```bash
npx every-plugin create my-awesome-plugin
```

**Features:**
- Generates plugin boilerplate with proper package.json
- Sets up Module Federation configuration
- Includes TypeScript and build setup
- Configures shared dependencies automatically

### `verify <plugin-path>`
Validate plugin compatibility and configuration.

```bash
npx every-plugin verify ./my-plugin
```

**Checks:**
- Dependency compatibility with current every-plugin version
- Module Federation configuration validity
- Contract schema validation
- Build output verification

### `upgrade <plugin-path>`
Update plugin to latest compatible versions.

```bash
npx every-plugin upgrade ./my-plugin
```

**Actions:**
- Updates every-plugin peer dependency
- Regenerates Module Federation shared config
- Updates build tooling if needed
- Maintains backward compatibility

### `register <plugin-path>`
Register plugin with the every-plugin registry.

```bash
npx every-plugin register ./my-plugin
```

**Process:**
- Validates plugin before registration
- Uploads to registry with metadata
- Generates registry entry
- Handles versioning and updates

## Design Principles

- **Zero Configuration**: Plugins only need `every-plugin` as peer dependency
- **Automatic Compatibility**: CLI handles version alignment
- **Easy Upgrades**: Seamless migration between every-plugin versions
- **Developer Experience**: Simple commands, clear feedback
