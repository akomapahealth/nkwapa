import { KeycloakProvider } from '../KeycloakProvider';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <KeycloakProvider>{children}</KeycloakProvider>;
}
