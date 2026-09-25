import { AuditAction } from '@prisma/client';
import { toEmergencyTimeline } from './emergency.mapper';

/** Regression coverage for a real bug caught during manual verification: the
 *  timeline showed a generic "Update" for the acknowledge transition because
 *  the label lookup key didn't match the metadata.transition value actually
 *  written by EmergencyService.updateStatus() ('acknowledged', not
 *  'acknowledge'). */
describe('toEmergencyTimeline', () => {
  const baseLog = {
    id: 'log-1',
    actorId: 'user-1',
    entityType: 'EmergencyCase',
    entityId: 'case-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    actor: { firstName: 'Nora', lastName: 'Nurse' },
  };

  it.each([
    [undefined, 'CREATE', 'Emergency request created'],
    ['acknowledged', 'UPDATE', 'Acknowledged'],
    ['team_assigned', 'UPDATE', 'Team assigned'],
    ['responding', 'UPDATE', 'Marked as responding'],
    ['arrived', 'UPDATE', 'Team arrived'],
    ['resolved', 'UPDATE', 'Case resolved'],
    ['cancelled', 'UPDATE', 'Case cancelled'],
    ['priority', 'UPDATE', 'Priority changed'],
    ['note', 'UPDATE', 'Note added'],
    ['location_shared', 'UPDATE', 'Location shared'],
    ['location', 'VIEW', 'Location viewed'],
  ] as const)('labels transition=%s action=%s as "%s"', (transition, action, expectedLabel) => {
    const [timelineEvent] = toEmergencyTimeline([
      {
        ...baseLog,
        action: action as AuditAction,
        metadata: transition ? { transition } : null,
      },
    ]);

    expect(timelineEvent.label).toBe(expectedLabel);
    expect(timelineEvent.actorName).toBe('Nora Nurse');
  });
});
