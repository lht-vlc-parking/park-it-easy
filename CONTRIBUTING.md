# Contributing to Park It Easy Office

First off, thank you for considering contributing to Park It Easy Office! It's people like you that make this project a great tool for everyone.

## Code of Conduct

This project and everyone participating in it is governed by our commitment to creating a welcoming and inclusive environment. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

### Our Standards

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** to demonstrate the steps
- **Describe the behavior you observed** and what behavior you expected
- **Include screenshots** if possible
- **Include your environment details** (OS, Node version, browser, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful**
- **List any examples** of where this enhancement exists elsewhere

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the coding standards** outlined below
3. **Write or update tests** for your changes
4. **Ensure the test suite passes** (`npm test` and `npm run test:e2e`)
5. **Run the linter** and fix any issues (`npm run lint`)
6. **Update documentation** as needed
7. **Write a clear commit message**

## Development Workflow

### Setting Up Your Development Environment

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR-USERNAME/park-it-easy-office.git
   cd park-it-easy-office
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```
   
4. Add your Supabase credentials to `.env`

5. Start the development server:
   ```bash
   npm run dev
   ```

### Development Process

1. **Create a new branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```

2. **Make your changes** following our coding standards

3. **Test your changes**:
   ```bash
   # Run unit tests
   npm test
   
   # Run E2E tests
   npm run test:e2e
   
   # Run linter
   npm run lint
   ```

4. **Commit your changes** with a descriptive commit message:
   ```bash
   git commit -m "feat: add new feature X"
   # or
   git commit -m "fix: resolve issue with Y"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** on GitHub

## Coding Standards

### TypeScript/JavaScript

- **Use TypeScript** for all new files
- **Follow existing code style** - we use ESLint for consistency
- **Write type-safe code** - avoid `any` types when possible
- **Use descriptive variable names** - clarity over brevity
- **Add JSDoc comments** for complex functions
- **Keep functions small** and focused on a single responsibility

### React Components

- **Use functional components** with hooks
- **Follow the component structure**:
  ```tsx
  // 1. Imports
  import { useState } from "react";
  
  // 2. Types/Interfaces
  interface MyComponentProps {
    // ...
  }
  
  // 3. Component
  export const MyComponent = ({ prop1, prop2 }: MyComponentProps) => {
    // 4. Hooks
    const [state, setState] = useState();
    
    // 5. Event handlers
    const handleClick = () => {
      // ...
    };
    
    // 6. Render
    return (
      // JSX
    );
  };
  ```

- **Extract complex logic** into custom hooks
- **Memoize expensive computations** with `useMemo`
- **Use proper prop types** - no inline type definitions
- **Handle loading and error states** appropriately

### File Organization

- **Group related files** together
- **Use descriptive file names** - match the export name
- **One component per file** (except for tightly coupled components)
- **Place tests** next to the code they test or in `/src/test/` or `/e2e/`
- **Use barrel exports** (`index.ts`) sparingly

### Naming Conventions

- **Components**: PascalCase - `MyComponent.tsx`
- **Hooks**: camelCase starting with "use" - `useMyHook.ts`
- **Utilities**: camelCase - `myUtility.ts`
- **Services**: camelCase with "Service" suffix - `authService.ts`
- **Constants**: UPPER_SNAKE_CASE - `const MAX_RETRIES = 3`
- **Types/Interfaces**: PascalCase - `interface UserData {}`

### Testing

- **Write tests** for all new features and bug fixes
- **Aim for high coverage** but prioritize meaningful tests
- **Use descriptive test names** - "it should do X when Y"
- **Test user behavior**, not implementation details
- **Mock external dependencies** (Supabase, etc.)
- **Test edge cases** and error conditions

Example test structure:
```typescript
describe('MyComponent', () => {
  it('should render correctly with valid props', () => {
    // Arrange
    const props = { ... };
    
    // Act
    render(<MyComponent {...props} />);
    
    // Assert
    expect(screen.getByText('...')).toBeInTheDocument();
  });
  
  it('should handle error state gracefully', () => {
    // ...
  });
});
```

### Git Commit Messages

- **Use the present tense** ("Add feature" not "Added feature")
- **Use the imperative mood** ("Move cursor to..." not "Moves cursor to...")
- **Limit the first line to 72 characters**
- **Reference issues and pull requests** after the first line

Commit message format:
```
<type>: <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Example:
```
feat: add motorcycle capacity validation

Implement validation to ensure no more than 4 motorcycles
can book the same spot at overlapping times.

Closes #123
```

## Documentation

- **Update the README** if you change functionality
- **Add JSDoc comments** for public APIs
- **Document complex logic** with inline comments
- **Update type definitions** when changing interfaces
- **Include code examples** in documentation when helpful

## Review Process

1. **All submissions require review** before merging
2. **Maintainers will review** your pull request
3. **Address feedback** promptly and professionally
4. **Be open to suggestions** for improvements
5. **Once approved**, a maintainer will merge your PR

## Questions?

Don't hesitate to ask questions! You can:

- **Open an issue** for general questions
- **Comment on relevant issues** for context-specific questions
- **Reach out to maintainers** if you need clarification

## Recognition

Contributors will be recognized in:

- The project's contributor list
- Release notes for significant contributions
- Special recognition for outstanding contributions

Thank you for contributing to Park It Easy Office! 🎉
