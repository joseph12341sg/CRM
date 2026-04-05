type BadgeProps = {
  label: string;
  color: 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'teal' | 'gray' | 'amber';
  size?: 'sm' | 'md';
};

const colorMap: Record<BadgeProps['color'], string> = {
  green: 'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  teal: 'bg-teal-100 text-teal-800',
  gray: 'bg-gray-100 text-gray-800',
  amber: 'bg-amber-100 text-amber-800',
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
