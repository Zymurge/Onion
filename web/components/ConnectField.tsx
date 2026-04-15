type ConnectFieldProps = {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  type?: string
}

export function ConnectField({ label, value, placeholder, onChange, type = 'text' }: ConnectFieldProps) {
  return (
    <label className="connect-field">
      <span className="stat-label">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}