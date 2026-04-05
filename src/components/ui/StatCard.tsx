type StatCardProps = {
  label: string;
  value: string | number;
  accent?: boolean;
};

export default function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div
      className={`bg-dark-card border border-dark-border rounded-xl p-6 shadow-gold-sm transition-all duration-200 hover:shadow-gold-md ${
        accent ? 'border-l-4 border-l-gold' : ''
      }`}
    >
      <p className="text-2xl font-heading font-bold text-gold">{value}</p>
      <p className="mt-1 text-sm text-text-secondary">{label}</p>
    </div>
  );
}
