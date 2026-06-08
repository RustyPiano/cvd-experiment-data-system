import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { VocabularySelectOption } from '../editor-types'
import { createVocabularyValue } from '../api'
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { VocabularyCombobox } from './vocabulary-combobox'

/**
 * A {@link VocabularyCombobox} wired to persist user-typed values into a shared,
 * user-extendable vocabulary (e.g. material brands). A value the user types that
 * is not yet in the list can be promoted into the public list; once created it
 * becomes visible to everyone and is selected for the current field.
 */
export function CreatableVocabularyCombobox({
  ariaLabel,
  disabled,
  onChange,
  options,
  placeholder,
  value,
  vocabKey,
}: {
  ariaLabel: string
  disabled: boolean
  onChange: (value: string) => void
  options: VocabularySelectOption[]
  placeholder: string
  value: string
  vocabKey: string
}) {
  const { session } = useAuth()
  const accessToken = session.accessToken
  const queryClient = useQueryClient()
  const currentUserId = session.currentUser?.id ?? 'anonymous'

  const createMutation = useMutation({
    mutationFn: (rawValue: string) =>
      createVocabularyValue(accessToken!, {
        vocab_key: vocabKey,
        value: rawValue,
      }),
    onSuccess: async (entry) => {
      await queryClient.invalidateQueries({
        queryKey: ['vocabularies', vocabKey, currentUserId],
      })
      onChange(entry.value)
      toast.success(`已添加“${entry.value}”到公共列表`)
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, '添加到公共列表失败'))
    },
  })

  return (
    <VocabularyCombobox
      ariaLabel={ariaLabel}
      creating={createMutation.isPending}
      disabled={disabled}
      onChange={onChange}
      onCreate={
        accessToken ? (rawValue) => createMutation.mutate(rawValue) : undefined
      }
      options={options}
      placeholder={placeholder}
      value={value}
    />
  )
}
