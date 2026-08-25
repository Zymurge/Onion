import './UserSideMenu.css'

type UserSideMenuProps = {
  activeItem?: 'dashboard' | 'create-game' | 'account'
  onSignOut?: () => void
}

const menuItems = [
  { key: 'dashboard', label: 'Dashboard', href: '/user/dashboard' },
  { key: 'create-game', label: 'Create Game', href: '/game/create' },
  { key: 'account', label: 'Account', href: '/user/create' },
] as const

export function UserSideMenu({ activeItem = 'dashboard', onSignOut }: UserSideMenuProps) {
  return (
    <aside className="user-side-menu">
      <p className="eyebrow">Onion command</p>
      <nav aria-label="User menu">
        {menuItems.map((item) => (
          <a
            key={item.key}
            className={item.key === activeItem ? 'user-side-menu-link user-side-menu-link-active' : 'user-side-menu-link'}
            href={item.href}
            aria-current={item.key === activeItem ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {onSignOut ? (
        <button type="button" className="user-side-menu-sign-out" onClick={onSignOut}>Sign Out</button>
      ) : null}
    </aside>
  )
}