import { useState } from 'react'
import { serializeFrontmatter } from '@shared/frontmatter'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { api } from '@/lib/api'
import { isValidResourceName } from './resourceCache'
import { TextArea, TextInput } from './editorParts'

type Step = 'name' | 'description' | 'prompt'
const STEPS: Step[] = ['name', 'description', 'prompt']

/**
 * Guided agent creation: name, then description, then the system prompt —
 * one focused decision per screen instead of a bare name field that dumps
 * you into a mostly-empty editor. Each step is a full field, not a dense
 * form, because these three are the fields a new agent can't do without.
 */
export function AgentCreateDialog({
  projectPath,
  onCreated,
  onOpenChange,
}: {
  projectPath: string
  onCreated: (name: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(step)

  const goNext = () => {
    if (step === 'name') {
      if (!isValidResourceName(name.trim())) {
        setError('Names are lowercase letters, digits, and hyphens.')
        return
      }
      setError(null)
      setStep('description')
    } else if (step === 'description') {
      setStep('prompt')
    }
  }

  const create = async () => {
    const trimmed = name.trim()
    const content = serializeFrontmatter({ name: trimmed, description }, prompt)
    const result = await api['config:agents:create']({ projectPath, name: trimmed, content })
    if (!result.ok) {
      setError(result.error ?? 'Could not create it.')
      setStep('name')
      return
    }
    onCreated(trimmed)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        title="New agent"
        description={`Step ${stepIndex + 1} of ${STEPS.length}`}
        className="w-[min(30rem,calc(100vw-4rem))]"
      >
        <div className="flex flex-col gap-4">
          {step === 'name' ? (
            <Field label="Name" hint="Lowercase letters, digits, and hyphens.">
              <TextInput
                mono
                value={name}
                onChange={setName}
                placeholder="code-reviewer"
                aria-label="Agent name"
              />
            </Field>
          ) : null}

          {step === 'description' ? (
            <Field label="Description" hint="When should Claude delegate to this agent?">
              <TextArea
                value={description}
                onChange={setDescription}
                rows={3}
                aria-label="Agent description"
              />
            </Field>
          ) : null}

          {step === 'prompt' ? (
            <Field label="System prompt" hint="What this agent knows and how it should behave.">
              <TextArea value={prompt} onChange={setPrompt} rows={10} mono aria-label="System prompt" />
            </Field>
          ) : null}

          {error ? <p className="text-xs text-danger">{error}</p> : null}

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(STEPS[stepIndex - 1] ?? 'name')}
              disabled={stepIndex === 0}
            >
              Back
            </Button>
            {step === 'prompt' ? (
              <Button variant="primary" size="sm" onClick={() => void create()}>
                Create
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={goNext}>
                Next
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
