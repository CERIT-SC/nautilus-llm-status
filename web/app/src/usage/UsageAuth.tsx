import { useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Code,
  Muted,
  P,
} from "@e-infra/design-system";
import { signInUrl } from "./api";
import type { Me } from "./types";

export function UsageSignIn({ message }: { message: string | null }) {
  return (
    <>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>See what you spent on the LLM gateway</CardTitle>
          <CardDescription className="text-text-muted mt-2">
            Sign in with your e&#8209;INFRA CZ identity to read your own token
            and cost history, broken down by model and by day, week, month or
            year.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 px-0">
          {message ? (
            <Alert variant="error">
              <AlertTitle>Sign-in failed</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button asChild className="w-full">
            <a href={signInUrl}>Sign in with e&#8209;INFRA CZ</a>
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}

export function UsageNotLinked({ me }: { me: Me }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(me.identifier);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the value is on screen anyway */
    }
  };

  return (
    <div className="grid gap-4">
      <Alert variant="warning">
        <AlertTitle>No gateway account found</AlertTitle>
        <AlertDescription>
          You are signed in, but no LLM gateway account is linked to this
          identity yet, so there is nothing to read. Send the identifier below
          to whoever administers the gateway and ask them to attach it to your
          account.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Your identity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 px-0">
          <Field label="Identifier">
            <Code className="break-all">{me.identifier}</Code>
          </Field>
          <Field label="Expected sso_user_id">
            <Code className="break-all">{me.expected_sso_user_id}</Code>
          </Field>
          {me.brokered ? (
            <Field label="Sign-in subject">
              <Code className="break-all text-text-muted">{me.sub}</Code>
              <Muted className="mt-1">
                Issued by{" "}
                {me.connector
                  ? `the ${me.connector} broker`
                  : "an identity broker"}{" "}
                and decoded to the identifier above.
              </Muted>
            </Field>
          ) : null}
          <div>
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? "Copied" : "Copy identifier"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <P className="text-xs font-medium tracking-wide text-text-muted uppercase">
        {label}
      </P>
      {children}
    </div>
  );
}
