import { BadRequestException, Injectable } from '@nestjs/common';
import type { ResearchStorageProvider } from '@prisma/client';
import { GithubResearchStorage } from './github-research-storage';
import { LocalResearchStorage, R2ResearchStorage } from './object-store-research-storage';
import type { ResearchStorageAdapter } from './research-storage.port';

const PROVIDER_ORDER: ResearchStorageProvider[] = ['R2', 'GITHUB', 'LOCAL'];

/** Picks a research destination from configuration (#166). */
@Injectable()
export class ResearchStorageRegistry {
  private readonly adapters: Record<ResearchStorageProvider, ResearchStorageAdapter>;

  constructor(
    r2: R2ResearchStorage,
    readonly github: GithubResearchStorage,
    local: LocalResearchStorage,
  ) {
    this.adapters = { R2: r2, GITHUB: github, LOCAL: local };
  }

  /** The destinations this environment can publish to, most recommended first. */
  available(): ResearchStorageProvider[] {
    return PROVIDER_ORDER.filter((provider) => this.adapters[provider].isConfigured());
  }

  /**
   * `RESEARCH_STORAGE_PROVIDER` when it is set; otherwise R2 if configured, then GitHub, then the
   * local folder, so an existing GitHub deployment keeps publishing where it did.
   */
  defaultProvider(): ResearchStorageProvider {
    const chosen = process.env.RESEARCH_STORAGE_PROVIDER?.trim().toUpperCase();
    if (chosen) {
      if (!PROVIDER_ORDER.includes(chosen as ResearchStorageProvider)) {
        throw new Error(`RESEARCH_STORAGE_PROVIDER must be r2, github or local, not ${chosen}`);
      }
      return chosen as ResearchStorageProvider;
    }
    return this.available()[0] ?? 'GITHUB';
  }

  get(provider: ResearchStorageProvider | null | undefined): ResearchStorageAdapter {
    return this.adapters[provider ?? this.defaultProvider()];
  }

  /** Refuse a destination this environment cannot publish to, before anything is created. */
  assertAvailable(provider: ResearchStorageProvider): void {
    if (!this.adapters[provider].isConfigured()) {
      throw new BadRequestException(`Research storage ${provider} is not configured here`);
    }
  }

  /** Whether manifests should also go to GitHub when the data went elsewhere. */
  mirrorsManifests(provider: ResearchStorageProvider): boolean {
    return (
      provider !== 'GITHUB' &&
      process.env.RESEARCH_GITHUB_MIRROR_MANIFESTS?.trim().toLowerCase() === 'true' &&
      this.github.isConfigured()
    );
  }
}
