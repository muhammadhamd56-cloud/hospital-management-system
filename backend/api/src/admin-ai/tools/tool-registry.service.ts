import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AiToolSpec } from '../providers/model-provider.interface';
import type { AiActionHandler } from './ai-action.types';
import {
  AI_TOOL_PROVIDERS,
  toWireName,
  type AiDomain,
  type AiPermission,
  type AiToolDefinition,
  type AiToolProvider,
} from './ai-tool.types';

const TOOL_NAME = /^[a-z]+\.[a-zA-Z][a-zA-Z0-9]{1,48}$/;

/**
 * Single source of truth for what the copilot can do. Built once at boot from
 * the 15 domain providers; refuses to start on a malformed or duplicate tool
 * so a bad definition fails the deploy, not a live conversation.
 */
@Injectable()
export class ToolRegistryService {
  private readonly toolsByWireName = new Map<string, AiToolDefinition>();
  private readonly specsByWireName = new Map<string, AiToolSpec>();
  private readonly actions = new Map<string, AiActionHandler>();

  constructor(@Inject(AI_TOOL_PROVIDERS) providers: AiToolProvider[]) {
    for (const provider of providers) {
      for (const tool of provider.tools()) this.registerTool(provider.domain, tool);
      for (const action of provider.actions?.() ?? []) this.registerAction(provider.domain, action);
    }
  }

  private registerTool(domain: AiDomain, tool: AiToolDefinition): void {
    if (!TOOL_NAME.test(tool.name) || !tool.name.startsWith(`${domain}.`) || tool.domain !== domain) {
      throw new Error(`AI tool "${tool.name}" must be named "${domain}.<action>"`);
    }
    if (tool.permission !== `ai.${tool.mode}.${domain}`) {
      throw new Error(`AI tool "${tool.name}" must require ai.${tool.mode}.${domain}`);
    }
    const wire = toWireName(tool.name);
    if (this.toolsByWireName.has(wire)) {
      throw new Error(`Duplicate AI tool "${tool.name}"`);
    }
    this.toolsByWireName.set(wire, tool);
    this.specsByWireName.set(wire, {
      name: wire,
      description: tool.description,
      inputSchema: toInputSchema(tool.input),
    });
  }

  private registerAction(domain: AiDomain, action: AiActionHandler): void {
    if (!action.type.startsWith(`${domain}.`) || action.domain !== domain) {
      throw new Error(`AI action "${action.type}" must be named "${domain}.<action>"`);
    }
    if (this.actions.has(action.type)) {
      throw new Error(`Duplicate AI action "${action.type}"`);
    }
    this.actions.set(action.type, action);
  }

  findByWireName(wireName: string): AiToolDefinition | undefined {
    return this.toolsByWireName.get(wireName);
  }

  findAction(type: string): AiActionHandler | undefined {
    return this.actions.get(type);
  }

  /**
   * Specs for the tools this permission set may call -- nothing else is ever shown to the model.
   * `domains`, when given, narrows the list further to keep the prompt small; it never widens it.
   */
  specsFor(permissions: ReadonlySet<AiPermission>, writesEnabled: boolean, domains?: readonly AiDomain[]): AiToolSpec[] {
    const specs: AiToolSpec[] = [];
    for (const [wire, tool] of this.toolsByWireName) {
      if (tool.mode === 'propose' && !writesEnabled) continue;
      if (!permissions.has(tool.permission)) continue;
      if (domains && !domains.includes(tool.domain)) continue;
      specs.push(this.specsByWireName.get(wire) as AiToolSpec);
    }
    return specs;
  }

  /** Capability catalogue for docs and the UI. */
  catalogue(): Array<{ name: string; domain: AiDomain; mode: string; description: string }> {
    return [...this.toolsByWireName.values()].map((tool) => ({
      name: tool.name,
      domain: tool.domain,
      mode: tool.mode,
      description: tool.description,
    }));
  }
}

function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  if (json.type !== 'object') {
    throw new Error('AI tool input schemas must be objects');
  }
  return json;
}
