/**
 * marketplace-types.ts — Shared type definitions for the marketplace catalog system
 */

export interface CatalogItem {
    id: string
    name: string
    description: string
    type: "agent" | "skill" | "plugin"
    source: "voltagent-agents" | "composio" | "community" | "anthropic"
    categories: string[]
    directUrl: string
    installPath: string
    tags: string[]
}

export interface MarketplaceCatalog {
    version: string
    builtAt?: string
    items: CatalogItem[]
}

export interface ScoredItem {
    item: CatalogItem
    score: number
    reason: string
}

export interface CatalogQueryResult {
    matches: ScoredItem[]
    matchedCategories: string[]
    isAgent: boolean
}
