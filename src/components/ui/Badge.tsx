type BadgeProps = {
  label: string;
  color: 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'teal' | 'gray' | 'amber';
  size?: 'sm' | 'md';
};

const colorMap: Record<BadgeProps['color'], string> = {
  green: 'bg-success/15 text-success border border-success/20',
  yellow: 'bg-warning/15 text-warning border border-warning/20',
  red: 'bg-danger/15 text-danger border border-danger/20',
  blue: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  teal: 'bg-teal-500/15 text-teal-400 border border-teal-500/20',
  gray: 'bg-dark-elevated text-text-secondary border border-dark-border',
  amber: 'bg-warning/15 text-warning border border-warning/20',
};

const sizeMap: Record<NonNullable<BadgeProps['size']>, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export default function Badge({ label, color, size = 'sm' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${colorMap[color]} ${sizeMap[size]}`}
    >
      {label}
    </span>
  );
}
