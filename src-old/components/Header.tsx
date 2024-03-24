import Link from 'next/link';
import { useRouter } from 'next/router'

const Header = () => {
  const router = useRouter()
  const currentRoute = router.pathname;
console.log(currentRoute)
  return (
    <header>
      <ul className="nav">
        <li className={currentRoute === '/' ? 'nav-item active' : 'nav-item' }>
          <Link href="/" prefetch={false}>Main Page</Link>
        </li>
        <li className={currentRoute === '/logs' ? 'nav-item active' : 'nav-item' }>
          <Link href="/logs" prefetch={false}>Logs</Link>
        </li>
      </ul>
    </header>
  )
}

export default Header;