import { describe, expect, it } from 'vitest';

import {
  buildInnerKeepAffordabilityReport,
  formatInnerKeepAffordabilityReport,
} from '../scripts/inner-keep-affordability-report';

describe('Inner Keep affordability report', () => {
  it('proves all four Level-1 choices on every current terrain', () => {
    const report = buildInnerKeepAffordabilityReport();

    expect(report.rows).toHaveLength(28);
    expect(report.allLevelOneProjectsReachable).toBe(true);
    expect(report.allTerrainsProgressionCapable).toBe(true);
    expect(report.noMandatoryFirstChoice).toBe(true);
    expect(report.goldworksRequiresGathering).toBe(true);
    expect(report.noCostApproachesAccountCap).toBe(true);
    expect(report.maximumLevelCost).toBe(9_450n);
  });

  it('labels estimates and stored-balance authority honestly', () => {
    const output = formatInnerKeepAffordabilityReport(
      buildInnerKeepAffordabilityReport(),
    );

    expect(output).toContain('Travel is deliberately excluded');
    expect(output).toContain('Only stored server-authoritative balances are spendable.');
    expect(output).toContain('No Level-1 building is a mandatory first choice: true.');
    expect(output).toContain('Goldworks always requires Gold gathering: true.');
    expect(output).toContain('Maximum cost remains below 1% of account cap: true.');
  });
});
