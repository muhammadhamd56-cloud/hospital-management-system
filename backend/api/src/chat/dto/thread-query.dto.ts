import { OptionalEntityId } from '../../common/validators/query-fields';

/** GET /chat/:doctorId -- `before` is a ChatMessage id; the thread page just
 *  older than it is returned (for "load earlier"). */
export class ChatThreadQueryDto {
  @OptionalEntityId()
  before?: string;
}
