import { useNavigate } from 'react-router-dom'
import Scanner from '../../components/Scanner'

export default function Scan() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-lg">
      <Scanner onResult={(lotId) => navigate(`/verify/${lotId}`)} />
    </div>
  )
}
