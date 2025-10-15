/**
 * Material Template module
 */

export interface MaterialTemplate {
  id: string;
  name: string;
  properties: Record<string, any>;
}

export class MaterialTemplateManager {
  private templates: Map<string, MaterialTemplate> = new Map();

  create(template: MaterialTemplate): void {
    this.templates.set(template.id, template);
  }

  get(id: string): MaterialTemplate | undefined {
    return this.templates.get(id);
  }

  update(id: string, properties: Record<string, any>): void {
    const template = this.templates.get(id);
    if (template) {
      template.properties = { ...template.properties, ...properties };
    }
  }

  delete(id: string): boolean {
    return this.templates.delete(id);
  }
}

export default MaterialTemplateManager;
