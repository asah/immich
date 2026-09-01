import { Link, Section, Text } from '@react-email/components';
import * as React from 'react';
import { ImmichButton } from 'src/emails/components/button.component';
import ImmichLayout from 'src/emails/components/immich.layout';
import { ActivityEmailProps } from 'src/repositories/email.repository';

export const ActivityEmail = ({ baseUrl, albumId, albumName, actorName, recipientName, activity, assetId, itemPath }: ActivityEmailProps) => {
  const itemUrl = `${baseUrl}${itemPath ?? `/albums/${albumId}${assetId ? `/photos/${assetId}` : ''}`}`;
  const settingsUrl = `${baseUrl}/user-settings?section=notifications`;
  return (
    <ImmichLayout preview={`${actorName} ${activity} a shared photo or album.`}>
      <Text className="m-0">Hey <strong>{recipientName}</strong>!</Text>
      <Text><strong>{actorName}</strong> {activity} <strong>{albumName}</strong>.</Text>
      <Section className="flex justify-center my-6"><ImmichButton href={itemUrl}>View activity</ImmichButton></Section>
      <Text className="text-xs">You are receiving this because you own or participated in this shared media. <Link href={settingsUrl}>Change notification settings</Link>.</Text>
    </ImmichLayout>
  );
};
