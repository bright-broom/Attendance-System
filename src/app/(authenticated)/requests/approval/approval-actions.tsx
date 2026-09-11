'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { decideRequest } from '../actions'
import styles from './approval-actions.module.css'

interface ApprovalActionsProps {
  requestId: string
}

export function ApprovalActions({ requestId }: ApprovalActionsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [showComment, setShowComment] = useState(false)
  const [error, setError] = useState('')

  const handleAction = async (action: 'approved' | 'rejected' | 'returned') => {
    setIsLoading(action)
    setError('')

    try {
      const { error: actionError } = await decideRequest(requestId, action, comment)
      if (actionError) {
        setError(actionError)
        return
      }
      router.refresh()
    } catch {
      setError('処理中にエラーが発生しました')
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className={styles.container}>
      {error && <p className={styles.error}>{error}</p>}
      {showComment && (
        <div className={styles.commentField}>
          <textarea
            className={styles.textarea}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="コメント（任意）"
            rows={2}
          />
        </div>
      )}

      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowComment(!showComment)}
        >
          {showComment ? 'コメントを隠す' : 'コメントを追加'}
        </Button>
        <div className={styles.buttons}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleAction('returned')}
            isLoading={isLoading === 'returned'}
            disabled={isLoading !== null}
          >
            差し戻し
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleAction('rejected')}
            isLoading={isLoading === 'rejected'}
            disabled={isLoading !== null}
          >
            却下
          </Button>
          <Button
            size="sm"
            onClick={() => handleAction('approved')}
            isLoading={isLoading === 'approved'}
            disabled={isLoading !== null}
          >
            承認
          </Button>
        </div>
      </div>
    </div>
  )
}
