import type {
  ASTNode,
  BinaryOperation,
  FunctionDefinition,
} from "@solidity-parser/parser/dist/src/ast-types.js";
import { isIdentifierNamed, isMemberNamed } from "./utils.js";

export const PRIVILEGE_MODIFIERS =
  /^(onlyOwner|onlyAdmin|onlyRole|auth|requiresAuth|adminOnly|ownerOnly|onlyMinter|onlyGovernance)$/i;

export function isMsgSender(node: ASTNode | null | undefined): boolean {
  return (
    !!node &&
    isMemberNamed(node, "sender") &&
    isIdentifierNamed(node.expression as ASTNode, "msg")
  );
}

export function isTxOrigin(node: ASTNode | null | undefined): boolean {
  return (
    !!node &&
    isMemberNamed(node, "origin") &&
    isIdentifierNamed(node.expression as ASTNode, "tx")
  );
}

/** msg.sender or tx.origin — presence of a caller identity check. */
export function isCallerIdentity(node: ASTNode | null | undefined): boolean {
  return isMsgSender(node) || isTxOrigin(node);
}

export function isOwnerLikeIdentifier(node: ASTNode | null | undefined): boolean {
  return (
    !!node &&
    node.type === "Identifier" &&
    ["owner", "admin", "guardian", "governance"].includes(
      (node as { name: string }).name.toLowerCase(),
    )
  );
}

function isCallerEqualsOwnerComparison(node: BinaryOperation): boolean {
  if (node.operator !== "==" && node.operator !== "!=") return false;
  const left = node.left as ASTNode;
  const right = node.right as ASTNode;
  return (
    (isCallerIdentity(left) && isOwnerLikeIdentifier(right)) ||
    (isCallerIdentity(right) && isOwnerLikeIdentifier(left))
  );
}

/**
 * Walk a subtree looking for caller-identity ==/!= owner-like comparisons.
 * Includes msg.sender and tx.origin. Guard presence ≠ guard safety —
 * tx.origin checks still count as an access-control pattern for suppression.
 */
export function mentionsCallerEqualsOwner(node: ASTNode | null | undefined): boolean {
  if (!node) return false;
  const stack: ASTNode[] = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || !("type" in cur)) continue;
    if (cur.type === "BinaryOperation" && isCallerEqualsOwnerComparison(cur as BinaryOperation)) {
      return true;
    }
    for (const value of Object.values(cur)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "type" in item) stack.push(item as ASTNode);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        stack.push(value as ASTNode);
      }
    }
  }
  return false;
}

/** @deprecated Prefer mentionsCallerEqualsOwner — kept for msg.sender-only privileged surfacing. */
export function mentionsMsgSenderEqualsOwner(node: ASTNode | null | undefined): boolean {
  if (!node) return false;
  const stack: ASTNode[] = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || !("type" in cur)) continue;
    if (cur.type === "BinaryOperation") {
      const bin = cur as BinaryOperation;
      if (bin.operator === "==" || bin.operator === "!=") {
        const left = bin.left as ASTNode;
        const right = bin.right as ASTNode;
        if (
          (isMsgSender(left) && isOwnerLikeIdentifier(right)) ||
          (isMsgSender(right) && isOwnerLikeIdentifier(left))
        ) {
          return true;
        }
      }
    }
    for (const value of Object.values(cur)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "type" in item) stack.push(item as ASTNode);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        stack.push(value as ASTNode);
      }
    }
  }
  return false;
}

export function privilegedModifierNames(fn: FunctionDefinition): string[] {
  return (fn.modifiers ?? [])
    .map((m) => m.name)
    .filter((name) => PRIVILEGE_MODIFIERS.test(name) || /^only[A-Z]/.test(name));
}

function statementMentionsRevert(node: ASTNode | null | undefined): boolean {
  if (!node) return false;
  let found = false;
  const stack: ASTNode[] = [node];
  while (stack.length && !found) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || !("type" in cur)) continue;
    if (cur.type === "RevertStatement") {
      found = true;
      break;
    }
    if (cur.type === "Identifier" && (cur as { name?: string }).name === "revert") {
      found = true;
      break;
    }
    if (cur.type === "FunctionCall") {
      const expr = (cur as { expression?: { type?: string; name?: string } }).expression;
      if (expr?.type === "Identifier" && expr.name === "revert") {
        found = true;
        break;
      }
    }
    for (const value of Object.values(cur)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "type" in item) stack.push(item as ASTNode);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        stack.push(value as ASTNode);
      }
    }
  }
  return found;
}

/**
 * True when the function body has a direct authorization gate such as:
 * - require/assert(msg.sender == owner) / (tx.origin == owner)
 * - if (msg.sender != owner) revert ...
 *
 * Note: tx.origin is recognized as guard *presence*, not as a *safe* guard.
 */
export function hasDirectAuthGuard(fn: FunctionDefinition): boolean {
  if (!fn.body) return false;
  const stack: ASTNode[] = [fn.body as unknown as ASTNode];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || !("type" in cur)) continue;

    if (cur.type === "FunctionCall") {
      const call = cur as {
        expression?: { type?: string; name?: string };
        arguments?: ASTNode[];
      };
      if (
        call.expression?.type === "Identifier" &&
        ["require", "assert"].includes(call.expression.name ?? "")
      ) {
        if (mentionsCallerEqualsOwner(call.arguments?.[0])) return true;
      }
    }

    if (cur.type === "IfStatement") {
      const ifNode = cur as {
        condition?: ASTNode;
        trueBody?: ASTNode;
        falseBody?: ASTNode | null;
      };
      if (mentionsCallerEqualsOwner(ifNode.condition)) {
        if (
          statementMentionsRevert(ifNode.trueBody) ||
          statementMentionsRevert(ifNode.falseBody ?? undefined)
        ) {
          return true;
        }
        // Also treat if (caller == owner) { ... privileged body ... } as a gate
        // when the comparison itself is the authorization branch condition.
        return true;
      }
    }

    for (const value of Object.values(cur)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "type" in item) stack.push(item as ASTNode);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        stack.push(value as ASTNode);
      }
    }
  }
  return false;
}

/** @deprecated Use hasDirectAuthGuard */
export function hasDirectSenderOwnerGuard(fn: FunctionDefinition): boolean {
  return hasDirectAuthGuard(fn);
}

/**
 * Recognized access-control *presence* (modifiers or direct auth gates).
 * Does not imply the guard is safe — e.g. tx.origin still counts here.
 */
export function hasRecognizedAccessControl(fn: FunctionDefinition): boolean {
  return privilegedModifierNames(fn).length > 0 || hasDirectAuthGuard(fn);
}

/** Depth-first collect of AST child nodes. */
export function walkAstChildren(node: ASTNode, visit: (n: ASTNode) => void): void {
  const stack: ASTNode[] = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || !("type" in cur)) continue;
    visit(cur);
    for (const value of Object.values(cur)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "type" in item) stack.push(item as ASTNode);
        }
      } else if (value && typeof value === "object" && "type" in value) {
        stack.push(value as ASTNode);
      }
    }
  }
}
