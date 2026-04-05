type StatCardProps = {
  label: string;
  value: string | number;
  accent?: boolean;
};

export default function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div
      className={`bg-white rounded-xl p-6 shadow-sm ${
        accent ? 'border-l-4 border-gold' : ''
      }`}
    >
      <p className="text-2xl font-bold text-navy">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  );
}
