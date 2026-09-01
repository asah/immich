import { Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import { ImmichButton } from 'src/emails/components/button.component';
import ImmichLayout from 'src/emails/components/immich.layout';
import { AlbumAccountInviteEmailProps } from 'src/repositories/email.repository';

export const AlbumAccountInviteEmail = ({ albumName, senderName, inviteUrl }: AlbumAccountInviteEmailProps) => (
  <ImmichLayout preview={`Join ${senderName}'s shared album.`}>
    <Text>{senderName} invited you to view <strong>{albumName}</strong>.</Text>
    <Text>Create an account with this email address to join the album. This invitation expires in 7 days.</Text>
    <Section className="flex justify-center my-6"><ImmichButton href={inviteUrl}>Create account and view album</ImmichButton></Section>
    <Text className="text-xs">One-time link: <Link href={inviteUrl}>{inviteUrl}</Link></Text>
  </ImmichLayout>
);

export default AlbumAccountInviteEmail;
