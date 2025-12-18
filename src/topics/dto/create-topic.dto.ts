import {
  IsNotEmpty,
  IsString,
  IsNumber,
} from 'class-validator';
export class CreateTopicDto {
    @IsNotEmpty()
    @IsString()
    topic_name: string;

    @IsNotEmpty()
    @IsString()
    description: string;
}

export class CreateSubTopicDto {

    @IsNotEmpty()
    @IsNumber()
    topic_id: number;

    @IsNotEmpty()
    @IsString()
    sub_topic_name: string;

    @IsNotEmpty()
    @IsString()
    description: string;
}



