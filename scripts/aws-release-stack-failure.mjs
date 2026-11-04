// Prints the FAILED CloudFormation rows after a failed stack deploy so the cause is in the job log.
// Diagnostics only: it never throws, so a lookup failure cannot hide the original deploy error.
const clean = (text, max) => String(text ?? '').replace(/\b\d{12}\b/g, '[account]').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/^(\s*)::/, '$1: :').trim().slice(0, max);

export function failedStackEventLines(events, { since = 0, limit = 8 } = {}) {
  if (!Array.isArray(events)) return [];
  return events
    .filter(event => /_FAILED$/.test(event?.ResourceStatus ?? '') && event.ResourceStatusReason && (!since || Date.parse(event.Timestamp) >= since))
    .slice(0, limit)
    .map(event => `  ${clean(event.LogicalResourceId, 80)} (${clean(event.ResourceType, 60)}) ${clean(event.ResourceStatus, 40)}: ${clean(event.ResourceStatusReason, 400)}`);
}

export function reportFailedStackEvents({ stackName, describeEvents, since = 0, log = console.error }) {
  try {
    const lines = failedStackEventLines(describeEvents(stackName)?.StackEvents, { since });
    log(lines.length ? `CloudFormation FAILED events for ${clean(stackName, 100)} (newest first):\n${lines.join('\n')}` : `CloudFormation reported no FAILED events for ${clean(stackName, 100)} in this run.`);
  } catch {
    log(`CloudFormation FAILED events for ${clean(stackName, 100)} could not be read; the deploy error above is unchanged.`);
  }
}
