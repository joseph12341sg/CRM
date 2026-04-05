export const PIPELINE_STAGES = ['new_lead', 'contacted', 'qualified', 'booked', 'won', 'lost'] as const;

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  new_lead: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  booked: 'Booked',
  won: 'Won',
  lost: 'Lost',
};

export const PIPELINE_STAGE_COLORS: Record<string, string> = {
  new_lead: 'blue',
  contacted: 'yellow',
  qualified: 'purple',
  booked: 'teal',
  won: 'green',
  lost: 'red',
};

export const HEALTH_COLORS: Record<string, string> = {
  healthy: 'green',
  warning: 'amber',
  critical: 'red',
};
